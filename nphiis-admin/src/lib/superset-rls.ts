import type { LocationInfo } from "@/types/user";

export interface RlsClause {
  clause: string;
  // Optional: dataset id if you want to scope the rule to specific datasets.
  // Omitting `dataset` applies the rule to all datasets in the dashboard.
  dataset?: number;
}

function escape(value: string): string {
  return value.replace(/'/g, "''");
}

// Build Superset RLS clauses for a guest token based on the user's roles +
// location. Superset evaluates each clause as additional WHERE conditions.
//
// Conventions on the underlying datasets (from reports/*.sql):
//   county_code, sub_county_code, ward_code, facility_id
// If your datasets use different names, update the column constants below.
const COL = {
  county: "county_code",
  subCounty: "sub_county_code",
  ward: "ward_code",
  facility: "facility_id",
  reportType: "report_type",
} as const;

export function buildRlsClauses(
  roles: string[],
  locationInfo?: LocationInfo,
): RlsClause[] {
  // National full access.
  if (
    roles.includes("ADMINISTRATOR") ||
    roles.includes("SUPERUSER") ||
    roles.includes("NATIONAL_FOCAL_PERSON") ||
    roles.includes("NATIONAL_LAB")
  ) {
    return [];
  }

  // National viewer: only line-list (MOH 505) datasets.
  if (roles.includes("NATIONAL_VIEWER")) {
    return [{ clause: `${COL.reportType} = 'MOH_505'` }];
  }

  // Geographic restriction by smallest scope the user has.
  if (
    roles.includes("FACILITY_SURVEILLANCE_FOCAL_PERSON") &&
    locationInfo?.facility
  ) {
    return [{ clause: `${COL.facility} = '${escape(locationInfo.facility)}'` }];
  }
  if (
    roles.includes("SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER") &&
    locationInfo?.subCounty
  ) {
    return [
      { clause: `${COL.subCounty} = '${escape(locationInfo.subCounty)}'` },
    ];
  }
  if (
    roles.includes("COUNTY_DISEASE_SURVEILLANCE_OFFICER") &&
    locationInfo?.county
  ) {
    return [{ clause: `${COL.county} = '${escape(locationInfo.county)}'` }];
  }

  // Default deny - empty result set rather than leaking everything.
  return [{ clause: "1 = 0" }];
}

/** A dataset on an embedded dashboard and the columns it exposes. */
export interface RlsDataset {
  id: number;
  columns: string[];
}

// Name columns of the datasets that have no Location codes (e.g. the VHF datasets): upper-case,
// single-spaced county / sub-county names, the same as Superset's own RLS rules match.
const NAME_COL = { county: "county_rls", subCounty: "subcounty_rls" } as const;

const normalizedName = (name: string) => escape(name.trim().replace(/\s+/g, " ").toUpperCase());

/**
 * The guest-token clauses for one dataset: the code clauses of buildRlsClauses when the dataset
 * has those columns, else the same scope on its county_rls / subcounty_rls names. A dataset
 * with neither is hidden from area-limited users rather than shown unfiltered.
 */
function clauseForDataset(clause: RlsClause, ds: RlsDataset, locationInfo?: LocationInfo): string {
  const has = (c: string) => ds.columns.includes(c);
  const column = clause.clause.split(" ")[0];
  if (clause.clause === "1 = 0" || has(column)) return clause.clause;
  if (column === COL.subCounty && has(NAME_COL.county) && has(NAME_COL.subCounty) && locationInfo?.subCountyName) {
    return (
      `${NAME_COL.county} = '${normalizedName(locationInfo.countyName ?? "")}' AND ` +
      `${NAME_COL.subCounty} = '${normalizedName(locationInfo.subCountyName)}'`
    );
  }
  if (column === COL.county && has(NAME_COL.county) && locationInfo?.countyName) {
    return `${NAME_COL.county} = '${normalizedName(locationInfo.countyName)}'`;
  }
  return "1 = 0";
}

/**
 * buildRlsClauses, applied per dataset of the dashboard so datasets that filter by name (or
 * cannot be filtered) still get the user's scope. Without dataset information it falls back to
 * buildRlsClauses unchanged.
 */
export function buildDatasetRlsClauses(
  roles: string[],
  locationInfo: LocationInfo | undefined,
  datasets: RlsDataset[] | null,
): RlsClause[] {
  const base = buildRlsClauses(roles, locationInfo);
  if (!datasets?.length || base.length === 0) return base;
  return base.flatMap((clause) =>
    datasets.map((ds) => ({ dataset: ds.id, clause: clauseForDataset(clause, ds, locationInfo) })),
  );
}
