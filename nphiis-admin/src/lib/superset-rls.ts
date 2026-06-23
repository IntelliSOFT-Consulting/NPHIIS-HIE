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
