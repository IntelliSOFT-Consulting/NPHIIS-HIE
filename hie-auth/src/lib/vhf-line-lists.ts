import fs from "fs";
import path from "path";
import { Pool, types } from "pg";

/**
 * The VHF line lists as the Superset dashboards show them, read from the analytics Postgres
 * (fhir_analytics, written by the data pipeline). The SQL in sql/vhf/ is a copy of the Superset
 * datasets' (NPHIIS-superset/docker/nphiis-analytics/postgres/); vhf-line-lists.test.ts fails
 * when the two differ, so a dataset change must be copied here too.
 *
 * Users see the rows Superset's guest-token rules would let them see (nphiis-admin
 * src/lib/superset-rls.ts): national roles everything, area roles their county / sub-county /
 * facility, anyone else nothing.
 */

export type Dataset = "line-list" | "contacts";

const SQL_FILES: Record<Dataset, string> = {
  "line-list": "vhf_line_list.sql",
  contacts: "vhf_contacts.sql",
};

// Same path from src/lib (ts-node) and build/lib (node).
const SQL_DIR = path.resolve(__dirname, "..", "..", "sql", "vhf");
const sqlCache = new Map<Dataset, string>();

export function datasetSql(dataset: Dataset): string {
  let sql = sqlCache.get(dataset);
  if (!sql) {
    sql = fs.readFileSync(path.join(SQL_DIR, SQL_FILES[dataset]), "utf8").trim().replace(/;\s*$/, "");
    sqlCache.set(dataset, sql);
  }
  return sql;
}

let pool: Pool | null = null;

function getPool(): Pool {
  const connectionString = process.env.ANALYTICS_DB_URL?.trim();
  if (!connectionString) throw new LineListUnavailable("ANALYTICS_DB_URL is not set");
  if (!pool) {
    pool = new Pool({
      connectionString,
      max: Number(process.env.ANALYTICS_DB_POOL_MAX ?? 3),
      statement_timeout: Number(process.env.ANALYTICS_DB_STATEMENT_TIMEOUT_MS ?? 60000),
      // Keep DATE columns as 'yyyy-mm-dd' text: a JS Date would shift with the server's zone.
      types: { getTypeParser: ((oid: number, format?: any) =>
        oid === types.builtins.DATE ? (v: string) => v
        // Counts come back as bigint; they are far below 2^53, so numbers are safe.
        : oid === types.builtins.INT8 ? (v: string) => Number(v)
        : types.getTypeParser(oid, format)) as any },
    });
    pool.on("error", (e) => console.error("[VhfLineLists] idle client error:", e.message));
  }
  return pool;
}

export class LineListUnavailable extends Error {}

export interface UserScope {
  roles: string[];
  location?: {
    county?: string; countyName?: string;
    subCounty?: string; subCountyName?: string;
    facility?: string;
  };
}

const NATIONAL_ROLES = ["ADMINISTRATOR", "SUPERUSER", "NATIONAL_FOCAL_PERSON", "NATIONAL_LAB"];

const normalizedName = (name: string) => name.trim().replace(/\s+/g, " ").toUpperCase();

/**
 * The WHERE condition limiting a dataset to the user's area, with its parameters numbered from
 * $1. Mirrors buildDatasetRlsClauses: code columns where the dataset has them (contacts), else
 * the county_rls / subcounty_rls names (line list); a scope the dataset cannot express is empty.
 */
export function scopeCondition(dataset: Dataset, scope: UserScope): { sql: string; params: string[] } {
  const { roles, location: loc } = scope;
  const hasCodes = dataset === "contacts";
  if (roles.some((r) => NATIONAL_ROLES.includes(r))) return { sql: "TRUE", params: [] };
  // NATIONAL_VIEWER is limited to report_type 'MOH_505'; no VHF dataset is.
  if (roles.includes("FACILITY_SURVEILLANCE_FOCAL_PERSON") && loc?.facility) {
    return hasCodes ? { sql: "facility_id = $1", params: [loc.facility] } : { sql: "FALSE", params: [] };
  }
  if (roles.includes("SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER") && loc?.subCounty) {
    if (hasCodes) return { sql: "sub_county_code = $1", params: [loc.subCounty] };
    if (!loc.subCountyName) return { sql: "FALSE", params: [] };
    return {
      sql: "county_rls = $1 AND subcounty_rls = $2",
      params: [normalizedName(loc.countyName ?? ""), normalizedName(loc.subCountyName)],
    };
  }
  if (roles.includes("COUNTY_DISEASE_SURVEILLANCE_OFFICER") && loc?.county) {
    if (hasCodes) return { sql: "county_code = $1", params: [loc.county] };
    if (!loc.countyName) return { sql: "FALSE", params: [] };
    return { sql: "county_rls = $1", params: [normalizedName(loc.countyName)] };
  }
  return { sql: "FALSE", params: [] };
}

export interface LineListFilters {
  /** Inclusive yyyy-mm-dd bounds on "Date Reported" (line list) or contact_date (contacts). */
  from?: string;
  to?: string;
  /** Line list: "Case" or "Contact". */
  recordType?: string;
  /** Contacts: active, flagged, lost, completed or converted. */
  status?: string;
  limit: number;
  offset: number;
}

const DATE_COLUMN: Record<Dataset, string> = { "line-list": `"Date Reported"`, contacts: "contact_date" };
const ORDER_BY: Record<Dataset, string> = {
  "line-list": `"Date Reported" DESC NULLS LAST, "EPID"`,
  contacts: "contact_date DESC NULLS LAST, encounter_id",
};

export function buildQuery(dataset: Dataset, scope: UserScope, f: LineListFilters): { sql: string; params: unknown[] } {
  const area = scopeCondition(dataset, scope);
  const params: unknown[] = [...area.params];
  const where = [area.sql];
  const add = (cond: (p: string) => string, value: unknown) => {
    params.push(value);
    where.push(cond(`$${params.length}`));
  };
  if (f.from) add((p) => `${DATE_COLUMN[dataset]} >= ${p}::date`, f.from);
  if (f.to) add((p) => `${DATE_COLUMN[dataset]} <= ${p}::date`, f.to);
  if (dataset === "line-list" && f.recordType) add((p) => `lower("Record Type") = lower(${p})`, f.recordType);
  if (dataset === "contacts" && f.status) add((p) => `status = lower(${p})`, f.status);
  params.push(f.limit, f.offset);
  const n = params.length;
  return {
    sql:
      `SELECT q.*, COUNT(*) OVER () AS __total FROM (\n${datasetSql(dataset)}\n) q\n` +
      `WHERE ${where.join(" AND ")}\nORDER BY ${ORDER_BY[dataset]}\nLIMIT $${n - 1} OFFSET $${n}`,
    params,
  };
}

export async function fetchLineList(dataset: Dataset, scope: UserScope, f: LineListFilters) {
  const { sql, params } = buildQuery(dataset, scope, f);
  const result = await getPool().query(sql, params);
  const total = result.rows.length ? Number(result.rows[0].__total) : 0;
  const rows = result.rows.map(({ __total, ...row }) => row);
  const columns = result.fields.map((c) => c.name).filter((c) => c !== "__total");
  return { total, rows, columns };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const addDays = (d: Date, n: number) => utc(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n);
// Monday of the week, as the line list's "Epi Week".
const monday = (d: Date) => addDays(d, -((d.getUTCDay() + 6) % 7));

export const PERIOD_HELP =
  "today, yesterday, this_week, last_week, this_month, last_month, this_year, last_year, " +
  "last_<N>_days, yyyy, yyyy-mm, yyyy-mm-dd or yyyy-Www (ISO week, Monday to Sunday)";

/**
 * A named period as inclusive yyyy-mm-dd bounds, relative to `today` (Kenya's date); null when
 * it is not one. Weeks run Monday to Sunday.
 */
export function resolvePeriod(period: string, today: string): { from: string; to: string } | null {
  const p = period.trim().toLowerCase();
  const [ty, tm, td] = today.split("-").map(Number);
  const t = utc(ty, tm - 1, td);
  const range = (from: Date, to: Date) => ({ from: iso(from), to: iso(to) });
  const valid = (d: Date, y: number, m: number, day: number) =>
    d.getUTCFullYear() === y && d.getUTCMonth() === m && d.getUTCDate() === day;

  switch (p) {
    case "today": return range(t, t);
    case "yesterday": return range(addDays(t, -1), addDays(t, -1));
    case "this_week": return range(monday(t), addDays(monday(t), 6));
    case "last_week": return range(addDays(monday(t), -7), addDays(monday(t), -1));
    case "this_month": return range(utc(ty, tm - 1, 1), utc(ty, tm, 0));
    case "last_month": return range(utc(ty, tm - 2, 1), utc(ty, tm - 1, 0));
    case "this_year": return range(utc(ty, 0, 1), utc(ty, 11, 31));
    case "last_year": return range(utc(ty - 1, 0, 1), utc(ty - 1, 11, 31));
  }
  let m = p.match(/^last_(\d{1,3})_days$/);
  if (m) {
    const n = Number(m[1]);
    return n >= 1 && n <= 366 ? range(addDays(t, 1 - n), t) : null;
  }
  if ((m = p.match(/^(\d{4})$/))) return range(utc(+m[1], 0, 1), utc(+m[1], 11, 31));
  if ((m = p.match(/^(\d{4})-(\d{2})$/))) {
    const mo = +m[2];
    return mo >= 1 && mo <= 12 ? range(utc(+m[1], mo - 1, 1), utc(+m[1], mo, 0)) : null;
  }
  if ((m = p.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
    const d = utc(+m[1], +m[2] - 1, +m[3]);
    return valid(d, +m[1], +m[2] - 1, +m[3]) ? range(d, d) : null;
  }
  if ((m = p.match(/^(\d{4})-w(\d{1,2})$/))) {
    // ISO week 1 is the week with 4 January in it.
    const start = addDays(monday(utc(+m[1], 0, 4)), (+m[2] - 1) * 7);
    const week = +m[2];
    return week >= 1 && week <= isoWeeks(+m[1]) ? range(start, addDays(start, 6)) : null;
  }
  return null;
}

/** ISO weeks in a year: 53 when it starts on a Thursday, or a leap year starting on a Wednesday. */
function isoWeeks(year: number): number {
  const jan1 = utc(year, 0, 1).getUTCDay();
  const leap = utc(year, 1, 29).getUTCMonth() === 1;
  return jan1 === 4 || (leap && jan1 === 3) ? 53 : 52;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  return [columns, ...rows.map((r) => columns.map((c) => r[c]))]
    .map((line) => line.map(csvCell).join(","))
    .join("\r\n") + "\r\n";
}
