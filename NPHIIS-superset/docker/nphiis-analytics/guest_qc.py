"""Stored query_context for embedded (guest-token) Superset charts.

Guest requests are checked by superset.security.manager.query_context_modified: every
metric / column / groupby / orderby the browser asks for must already be in the slice's
params or its stored query_context. A null query_context, or one that does not match what
each viz's buildQuery sends, fails with "Guest user cannot modify chart payload".

Every setup script that writes a Slice shown on an embedded dashboard calls
apply_guest_query_context(slice, params) after the slice has an id. Never set
query_context = None on those charts.
"""
import json


def _as_list(value):
    if value is None or value is False:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _base_axis_column(x_axis, time_grain):
    """Match @superset-ui/core normalizeTimeColumn for a physical x_axis column."""
    col = {
        "columnType": "BASE_AXIS",
        "sqlExpression": x_axis,
        "label": x_axis,
        "expressionType": "SQL",
    }
    # Frontend omits timeGrain when undefined; only include when set.
    if time_grain:
        col["timeGrain"] = time_grain
    return col


def query_context_from_params(slice_id, datasource_id, params):
    """Build a stored query_context so embedded guests pass the payload tamper check.

    The guest check (query_context_modified) requires request query columns/metrics/orderby
    to be a subset of what's stored on the slice. The dashboard frontend rebuilds the
    payload via each viz's buildQuery — notably:

    - metric (singular) becomes metrics[]
    - groupby / x_axis become query columns; x_axis is rewritten to a BASE_AXIS adhoc col
    - timeseries normalizeOrderBy adds orderby=[[first_metric, not order_desc]]

    Storing only the raw param strings therefore 403s with
    "Guest user cannot modify chart payload".
    """
    metrics = _as_list(params.get("metrics"))
    if not metrics and params.get("metric") is not None:
        metrics = [params["metric"]]
    # Table percent metrics and dual-axis extras are requested as metrics too.
    for key in ("percent_metrics", "metric_2", "secondary_metric"):
        for value in _as_list(params.get(key)):
            if value not in metrics:
                metrics.append(value)

    # Timeseries / cartesian: x_axis first, then series (groupby). Other keys still
    # collected so sankey/source-target and table all_columns stay covered.
    columns = []
    x_axis = params.get("x_axis")
    extras = params.get("extras") if isinstance(params.get("extras"), dict) else {}
    time_grain = params.get("time_grain_sqla") or extras.get("time_grain_sqla")

    def _add_col(value):
        if value not in columns:
            columns.append(value)

    def _add_physical_or_axis(value):
        """Store both raw and BASE_AXIS forms — guest check is a subset test."""
        if isinstance(value, str):
            _add_col(_base_axis_column(value, time_grain))
            _add_col(value)
        elif value is not None:
            _add_col(value)

    if x_axis:
        _add_physical_or_axis(x_axis)
    # Aggregate table charts may promote a temporal groupby col to BASE_AXIS.
    for key in (
        "columns",
        "all_columns",
        "groupby",
        "entity",
        "series",
        "x",
        "y",
        "size",
        "granularity_sqla",
        "source",
        "target",
        "source_category",
        "target_category",
    ):
        for value in _as_list(params.get(key)):
            if key in ("groupby", "columns", "granularity_sqla") and isinstance(value, str) and time_grain:
                _add_physical_or_axis(value)
            else:
                _add_col(value)

    # Guest check is subset: store every orderby shape viz plugins emit.
    order_desc = params.get("order_desc")
    if order_desc is None:
        order_desc = True
    orderby = []

    def _add_order(item):
        if item not in orderby:
            orderby.append(item)

    for item in _as_list(params.get("orderby")):
        _add_order(item)
    for raw in _as_list(params.get("order_by_cols")):
        try:
            parsed = json.loads(raw) if isinstance(raw, str) else raw
        except Exception:
            continue
        _add_order(parsed)
    for metric in metrics:
        # timeseries normalizeOrderBy; table aggregate default (always DESC=false asc flag)
        _add_order([metric, not order_desc])
        _add_order([metric, False])
        _add_order([metric, True])
    for metric in _as_list(params.get("timeseries_limit_metric")):
        _add_order([metric, not order_desc])
        _add_order([metric, False])

    groupby = _as_list(params.get("groupby"))
    form_data = {**params, "slice_id": slice_id, "datasource": f"{datasource_id}__table"}
    if metrics and not form_data.get("metrics"):
        form_data["metrics"] = metrics

    query = {
        "filters": [],
        "extras": {"having": "", "where": "", **({"time_grain_sqla": time_grain} if time_grain else {})},
        "applied_time_extras": {},
        "columns": columns,
        "metrics": metrics,
        "annotation_layers": [],
        "row_limit": params.get("row_limit") or 10000,
        "series_limit": 0,
        "order_desc": order_desc,
        "url_params": {},
        "custom_params": {},
        "custom_form_data": {},
    }
    if orderby:
        query["orderby"] = orderby
    if groupby:
        # Sankey-style charts keep source/target in groupby; guest check unions these.
        query["groupby"] = groupby
    if x_axis and groupby:
        query["series_columns"] = groupby

    return {
        "datasource": {"id": datasource_id, "type": "table"},
        "force": False,
        "queries": [query],
        "form_data": form_data,
        "result_format": "json",
        "result_type": "full",
    }


def enrich_params_for_guest(params):
    """Ensure params_dict covers keys the guest form_data half of the tamper check reads.

    query_context_modified compares request form_data metrics/columns/groupby/orderby
    against params_dict BEFORE merging stored query_context. Charts that only store
    `metric` / `all_columns` / `order_by_cols` therefore 403 when the browser normalizes
    those into metrics/columns/orderby on form_data.
    """
    out = dict(params)
    metrics = _as_list(out.get("metrics"))
    if not metrics and out.get("metric") is not None:
        metrics = [out["metric"]]
    for key in ("percent_metrics", "metric_2", "secondary_metric"):
        for value in _as_list(out.get(key)):
            if value not in metrics:
                metrics.append(value)
    if metrics:
        out["metrics"] = metrics

    if out.get("x_axis"):
        # Charts with an x_axis (echarts timeseries) never use a `columns` param, but the
        # frontend's pivot falls back to formData.columns: storing x_axis/groupby there
        # split every series by the axis value ("Suspected, 2026-10-19 …"). The guest
        # check is satisfied by groupby on params plus the stored query_context.
        out.pop("columns", None)
    else:
        columns = _as_list(out.get("columns"))
        for key in ("all_columns", "groupby", "entity", "series", "source", "target"):
            for value in _as_list(out.get(key)):
                if value not in columns:
                    columns.append(value)
        if columns:
            out["columns"] = columns

    orderby = _as_list(out.get("orderby"))
    for raw in _as_list(out.get("order_by_cols")):
        try:
            parsed = json.loads(raw) if isinstance(raw, str) else raw
        except Exception:
            continue
        if parsed not in orderby:
            orderby.append(parsed)
    if metrics:
        order_desc = True if out.get("order_desc") is None else out.get("order_desc")
        for item in (
            [metrics[0], not order_desc],
            [metrics[0], False],
            [metrics[0], True],
        ):
            if item not in orderby:
                orderby.append(item)
    if orderby:
        out["orderby"] = orderby
    return out


def apply_guest_query_context(slice_, params):
    """Write guest-safe params and query_context onto a Slice (it must have an id: flush first)."""
    if slice_.id is None or slice_.datasource_id is None:
        raise ValueError(f"slice {slice_.slice_name!r} needs an id and datasource before its query_context")
    params = enrich_params_for_guest(params)
    params["datasource"] = f"{slice_.datasource_id}__table"
    slice_.params = json.dumps(params)
    slice_.query_context = json.dumps(query_context_from_params(slice_.id, slice_.datasource_id, params))
    return params
