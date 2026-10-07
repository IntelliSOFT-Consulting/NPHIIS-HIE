"""Generate FHIR R4 SDC Questionnaires from a form spec (fields.csv + options.csv).

Usage:
    python3 forms/tools/build_questionnaires.py forms/vhf

Reads <dir>/fields.csv, <dir>/options.csv and <dir>/platform/afp-case.json and
writes one Questionnaire per form to <dir>/out/<form>.json. The syntax of
fields.csv is documented in forms/vhf/README.md.
"""
import copy
import csv
import json
import sys
from pathlib import Path

CANONICAL_BASE = "http://nphiis.health.go.ke/Questionnaire"
SOURCE_FIELD_EXT = "http://nphiis.health.go.ke/fhir/StructureDefinition/source-field"
FHIR_EXT = "http://hl7.org/fhir/StructureDefinition"
SDC_EXT = "http://hl7.org/fhir/uv/sdc/StructureDefinition"
ITEM_CONTROL_SYSTEM = "http://hl7.org/fhir/questionnaire-item-control"

FORM_TITLES = {
    "vhf-case": "VHF Case Investigation",
    "vhf-lab-results": "VHF - Lab Information",
    "vhf-clinical-outcome": "VHF - Clinical Care & Outcome",
    "vhf-contact-follow-up": "VHF - Contact Follow-up",
}

GROUP_TITLES = {
    "case_investigation": "Case Investigation",
    "demographics": "Demographics",
    "clinical": "Clinical Information",
    "exposure": "Exposure",
    "ipc": "Infection Prevention & Control",
    "travel": "Travel History",
    "vaccination": "Vaccination (Ebola)",
    "specimen": "Specimen Collection",
    "laboratory": "Laboratory",
    "preliminary": "Preliminary Result",
    "final": "Final Result",
    "clinical_care": "Clinical Care & Treatment",
    "outcome": "Outcome",
    "follow_up": "Contact Follow-up",
}

# Radio buttons up to this many options, drop-down above it.
MAX_RADIO_OPTIONS = 4

TYPE_MAP = {
    "string": "string",
    "text": "text",
    "integer": "integer",
    "date": "date",
    "choice": "choice",
    "reference": "reference",
    "hidden": "string",
}


def all_items(node):
    """Depth-first list of every item under a Questionnaire or item."""
    out = []
    for item in node.get("item", []):
        out.append(item)
        out.extend(all_items(item))
    return out


def _read_csv(path):
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def _load_options(path):
    options = {}
    for r in _read_csv(path):
        options.setdefault(r["value_set"], []).append({"code": r["code"], "display": r["display"]})
    return options


def _item_control(code):
    return {
        "url": f"{FHIR_EXT}/questionnaire-itemControl",
        "valueCodeableConcept": {"coding": [{"system": ITEM_CONTROL_SYSTEM, "code": code}]},
    }


def _today_date_ext(url, expression):
    return {
        "url": url,
        "valueDate": {
            "extension": [{
                "url": f"{FHIR_EXT}/cqf-calculatedValue",
                "valueExpression": {"language": "text/fhirpath", "expression": expression},
            }]
        },
    }


def _constraint_ext(rows_by_id, row):
    extensions, messages = [], []
    for c in filter(None, row["constraint"].split(";")):
        if c == "not_future":
            extensions.append(_today_date_ext(f"{FHIR_EXT}/maxValue", "today()"))
            messages.append("Cannot be a date in the future")
        elif c == "max_age_150":
            extensions.append(_today_date_ext(f"{FHIR_EXT}/minValue", "today() - 150 years"))
            messages.append("Age must be under 150 years")
        elif c.startswith("range:"):
            _, lo, hi = c.split(":")
            if lo:
                extensions.append({"url": f"{FHIR_EXT}/minValue", "valueInteger": int(lo)})
            if hi:
                extensions.append({"url": f"{FHIR_EXT}/maxValue", "valueInteger": int(hi)})
        elif c == "phone":
            extensions.append({"url": f"{FHIR_EXT}/regex", "valueString": r"^(\+254|0)[17]\d{8}$"})
            extensions.append({"url": f"{FHIR_EXT}/entryFormat", "valueString": "+254700000000"})
            messages.append("Enter a valid Kenyan phone number, e.g. +254700000000")
        elif c.startswith("after:"):
            other = c[len("after:"):]
            human = f"Must be on or after '{rows_by_id[other]['text']}'"
            # Same shape as the mobile/admin lab forms; parsed by
            # nphiis-admin/src/lib/questionnaires.ts dateMinFromLinkId().
            extensions.append({
                "url": f"{FHIR_EXT}/questionnaire-constraint",
                "extension": [
                    {"url": "key", "valueId": f"{row['link_id']}-after-{other}".replace("_", "-")},
                    {"url": "severity", "valueCode": "error"},
                    # Empty-safe: the other date may be hidden by enableWhen,
                    # and an empty result counts as a failed constraint.
                    {"url": "expression", "valueString":
                        f"%context.answer.value.empty() or "
                        f"%resource.descendants().where(linkId='{other}').answer.value.empty() or "
                        f"%context.answer.value >= %resource.descendants().where(linkId='{other}').answer.value"},
                    {"url": "human", "valueString": human},
                    {"url": "location", "valueString": other},
                ],
            })
        else:
            raise ValueError(f"{row['link_id']}: unknown constraint '{c}'")
    if messages:
        extensions.append({"url": "http://ehelse.no/fhir/StructureDefinition/validationtext",
                           "valueString": "; ".join(messages)})
    return extensions


def _enable_when(rows_by_id, options, row):
    conditions = []
    for cond in filter(None, row["enable_when"].split("|")):
        operator = "!=" if "!=" in cond else "="
        question, code = cond.split(operator)
        target = rows_by_id[question]
        if target["type"] == "choice":
            display = next(o["display"] for o in options[target["value_set"]] if o["code"] == code)
            conditions.append({"question": question, "operator": operator,
                               "answerCoding": {"code": code, "display": display}})
        else:
            raise ValueError(
                f"{row['link_id']}: enable_when target '{question}' is {target['type']}; only choice targets are supported"
            )
    return conditions


def _build_item(row, rows_by_id, options, platform_items):
    if row["type"] in ("platform_block", "reference"):
        item = copy.deepcopy(platform_items[row["link_id"]])
        if row["type"] == "reference":
            item["text"] = row["text"]
            item["required"] = row["required"] == "yes"
    else:
        item = {"linkId": row["link_id"], "text": row["text"], "type": TYPE_MAP[row["type"]]}
        if row["required"] == "yes":
            item["required"] = True
        extensions = []
        if row["type"] == "hidden":
            extensions.append({"url": f"{FHIR_EXT}/questionnaire-hidden", "valueBoolean": True})
        if row["type"] == "choice":
            opts = options[row["value_set"]]
            item["answerOption"] = [{"valueCoding": dict(o)} for o in opts]
            if row.get("initial"):
                item["initial"] = [{"valueCoding": dict(next(o for o in opts if o["code"] == row["initial"]))}]
            if row["repeats"] == "yes":
                item["repeats"] = True
                extensions.append(_item_control("check-box"))
            elif len(opts) <= MAX_RADIO_OPTIONS:
                extensions.append(_item_control("radio-button"))
                extensions.append({"url": f"{FHIR_EXT}/questionnaire-choiceOrientation",
                                   "valueCode": "horizontal" if len(opts) <= 3 else "vertical"})
            else:
                extensions.append(_item_control("drop-down"))
        extensions.extend(_constraint_ext(rows_by_id, row))
        if row["dd_field"]:
            extensions.append({"url": SOURCE_FIELD_EXT, "valueString": row["dd_field"]})
        if extensions:
            item["extension"] = extensions
    conditions = _enable_when(rows_by_id, options, row)
    if conditions:
        item["enableWhen"] = conditions
        if len(conditions) > 1:
            item["enableBehavior"] = "any"
    return item


def _platform_index(platform_path):
    platform = json.loads(Path(platform_path).read_text())
    return platform, {i["linkId"]: i for i in all_items(platform)}


def build_forms(fields_csv, options_csv, platform_json):
    rows = _read_csv(fields_csv)
    options = _load_options(options_csv)
    platform, platform_items = _platform_index(platform_json)

    forms = {}
    for form_id in dict.fromkeys(r["form"] for r in rows):
        form_rows = [r for r in rows if r["form"] == form_id]
        rows_by_id = {r["link_id"]: r for r in form_rows}
        q = {
            "resourceType": "Questionnaire",
            "id": form_id,
            "url": f"{CANONICAL_BASE}/{form_id}",
            "name": form_id.replace("-", "_"),
            "title": FORM_TITLES[form_id],
            "status": "active",
            "item": [],
        }
        if any(r["type"] in ("platform_block", "reference") for r in form_rows):
            # Location pickers resolve against these variables / launch context.
            q["extension"] = copy.deepcopy(platform.get("extension", []))

        groups = {}
        for r in form_rows:
            item = _build_item(r, rows_by_id, options, platform_items)
            if r["type"] == "platform_block":
                q["item"].append(item)
                continue
            if r["group"] not in groups:
                groups[r["group"]] = {
                    "linkId": f"vhf-{r['group']}",
                    "text": GROUP_TITLES[r["group"]],
                    "type": "group",
                    "extension": [_item_control("page")] if form_id == "vhf-case" else [],
                    "item": [],
                }
                if not groups[r["group"]]["extension"]:
                    del groups[r["group"]]["extension"]
                q["item"].append(groups[r["group"]])
            groups[r["group"]]["item"].append(item)
        forms[form_id] = q
    return forms


def main(argv):
    if len(argv) != 2:
        print(__doc__)
        return 2
    spec = Path(argv[1])
    out = spec / "out"
    out.mkdir(exist_ok=True)
    forms = build_forms(spec / "fields.csv", spec / "options.csv", spec / "platform" / "afp-case.json")
    for form_id, q in forms.items():
        (out / f"{form_id}.json").write_text(json.dumps(q, indent=2, ensure_ascii=False) + "\n")
        print(f"wrote {out / form_id}.json ({len(all_items(q))} items)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
