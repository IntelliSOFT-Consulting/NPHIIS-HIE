/**
 * Patient-identifier columns in analytics line lists. EPID / Source EPID stay visible.
 * Only ADMINISTRATOR may see these populated (Superset Jinja + this module for /reports/vhf).
 */

/**
 * Expand Superset Jinja used for PII masking so plain Postgres can run the SQL.
 * Always takes the identifiable branch; {@link maskPiiRows} strips columns for non-admins.
 */
export function expandSupersetJinja(sql: string): string {
  let out = sql.replace(/\{\{\s*can_view_pii\(\)\s*\|\s*tojson\s*\}\}/g, "true");
  out = out.replace(/\{\%\s*set\s+_\s*=\s*cache_key_wrapper\([^%]+\%\}/g, "");
  // {% if can_view_pii() %} ... {% else %} ... {% endif %} → keep the if-branch
  out = out.replace(
    /\{\%\s*if\s+can_view_pii\(\)\s*\%\}([\s\S]*?)\{\%\s*else\s*\%\}[\s\S]*?\{\%\s*endif\s*\%\}/g,
    "$1",
  );
  out = out.replace(/\{\%\s*if\s+can_view_pii\(\)\s*\%\}([\s\S]*?)\{\%\s*endif\s*\%\}/g, "$1");
  return out;
}

/** Columns nulled for non-ADMINISTRATOR on the VHF line list and contacts exports. */
export const VHF_LINE_LIST_PII_COLUMNS = [
  "patient_id",
  "Patient Name",
  "Birth Date",
  "Phone",
  "Village",
  "Contact ID",
] as const;

export const VHF_CONTACTS_PII_COLUMNS = ["contact_id"] as const;

/** All known analytics PII column names (Superset charts + API). */
export const ANALYTICS_PII_COLUMNS = [
  ...VHF_LINE_LIST_PII_COLUMNS,
  ...VHF_CONTACTS_PII_COLUMNS,
  "Patient ID",
  "Reporter Phone",
  "Person",
  "NamesOfPatient",
  "Patient name",
  "DateOfBirth",
  "Telephone No of parent or guardian",
  "Telephone no of parent or guardian",
  "Parent Guardian Name",
  "Name of Parent or Guardian",
  "Residence or Village",
  "Residence Village Estate Hse No",
  "Street Plot Estate S location",
  "Neighborhood major landmark",
  "patient_name",
  "parent_name",
  "parent_phone",
  "date_of_birth",
  "res_village",
  "res_landmark",
  "res_town",
  "investigator_phone",
  "investigator_address",
] as const;

const PII_SET = new Set<string>(ANALYTICS_PII_COLUMNS);

export function canViewAnalyticsPii(roles: string[] | undefined | null): boolean {
  return (roles ?? []).includes("ADMINISTRATOR");
}

/** Null out identifier columns in-place; returns the same rows array. */
export function maskPiiRows<T extends Record<string, unknown>>(
  rows: T[],
  roles: string[] | undefined | null,
  columns?: readonly string[],
): T[] {
  if (canViewAnalyticsPii(roles)) return rows;
  const hide = columns?.length ? new Set(columns) : PII_SET;
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (hide.has(key)) (row as Record<string, unknown>)[key] = null;
    }
  }
  return rows;
}
