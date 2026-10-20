import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { buildQuery, datasetSql, resolvePeriod, scopeCondition, toCsv } from "./vhf-line-lists";

const county = { county: "c1", countyName: "Nairobi ", subCounty: "s1", subCountyName: "Embakasi  East", facility: "f1" };

describe("scopeCondition", () => {
  it("lets national roles see everything", () => {
    expect(scopeCondition("line-list", { roles: ["NATIONAL_FOCAL_PERSON"] })).toEqual({ sql: "TRUE", params: [] });
  });

  it("limits the line list by area name and contacts by area code", () => {
    const roles = ["COUNTY_DISEASE_SURVEILLANCE_OFFICER"];
    expect(scopeCondition("line-list", { roles, location: county })).toEqual({ sql: "county_rls = $1", params: ["NAIROBI"] });
    expect(scopeCondition("contacts", { roles, location: county })).toEqual({ sql: "county_code = $1", params: ["c1"] });
  });

  it("matches sub-counties on county and sub-county name", () => {
    expect(scopeCondition("line-list", { roles: ["SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER"], location: county })).toEqual({
      sql: "county_rls = $1 AND subcounty_rls = $2",
      params: ["NAIROBI", "EMBAKASI EAST"],
    });
  });

  it("hides the line list from facility users (it has no facility code) but not contacts", () => {
    const scope = { roles: ["FACILITY_SURVEILLANCE_FOCAL_PERSON"], location: county };
    expect(scopeCondition("line-list", scope).sql).toBe("FALSE");
    expect(scopeCondition("contacts", scope)).toEqual({ sql: "facility_id = $1", params: ["f1"] });
  });

  it("denies other roles and area roles without an area", () => {
    expect(scopeCondition("contacts", { roles: ["NATIONAL_VIEWER"] }).sql).toBe("FALSE");
    expect(scopeCondition("contacts", { roles: ["COUNTY_DISEASE_SURVEILLANCE_OFFICER"] }).sql).toBe("FALSE");
    expect(scopeCondition("contacts", { roles: [] }).sql).toBe("FALSE");
  });
});

describe("buildQuery", () => {
  it("numbers the filter parameters after the area ones", () => {
    const { sql, params } = buildQuery(
      "line-list",
      { roles: ["COUNTY_DISEASE_SURVEILLANCE_OFFICER"], location: county },
      { from: "2026-10-01", to: "2026-10-20", recordType: "Contact", limit: 10, offset: 20 },
    );
    expect(params).toEqual(["NAIROBI", "2026-10-01", "2026-10-20", "Contact", 10, 20]);
    expect(sql).toContain(`WHERE county_rls = $1 AND "Date Reported" >= $2::date AND "Date Reported" <= $3::date AND lower("Record Type") = lower($4)`);
    expect(sql).toContain("LIMIT $5 OFFSET $6");
  });

  it("filters contacts by status and contact date", () => {
    const { sql, params } = buildQuery("contacts", { roles: ["SUPERUSER"] }, { status: "Lost", from: "2026-10-01", limit: 5, offset: 0 });
    expect(sql).toContain("WHERE TRUE AND contact_date >= $1::date AND status = lower($2)");
    expect(params).toEqual(["2026-10-01", "Lost", 5, 0]);
  });
});

describe("resolvePeriod", () => {
  const today = "2026-10-20"; // a Tuesday
  it.each([
    ["today", "2026-10-20", "2026-10-20"],
    ["yesterday", "2026-10-19", "2026-10-19"],
    ["this_week", "2026-10-19", "2026-10-25"],
    ["last_week", "2026-10-12", "2026-10-18"],
    ["this_month", "2026-10-01", "2026-10-31"],
    ["last_month", "2026-09-01", "2026-09-30"],
    ["this_year", "2026-01-01", "2026-12-31"],
    ["last_year", "2025-01-01", "2025-12-31"],
    ["last_7_days", "2026-10-14", "2026-10-20"],
    ["LAST_21_DAYS", "2026-09-30", "2026-10-20"],
    ["2026", "2026-01-01", "2026-12-31"],
    ["2024-02", "2024-02-01", "2024-02-29"],
    ["2026-10-05", "2026-10-05", "2026-10-05"],
    ["2026-W43", "2026-10-19", "2026-10-25"],
    ["2026-W01", "2025-12-29", "2026-01-04"],
    ["2020-W53", "2020-12-28", "2021-01-03"],
  ])("%s → %s to %s", (period, from, to) => {
    expect(resolvePeriod(period, today)).toEqual({ from, to });
  });

  it("handles January for last_month", () => {
    expect(resolvePeriod("last_month", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });

  it.each(["", "soon", "last_0_days", "last_400_days", "2026-13", "2026-02-30", "2025-W53", "2026-W54", "2026-W00"])(
    "rejects %j",
    (period) => expect(resolvePeriod(period, today)).toBeNull(),
  );
});

describe("toCsv", () => {
  it("quotes cells that need it and leaves nulls empty", () => {
    expect(toCsv(["a", "b"], [{ a: 'say "hi", ok', b: null }, { a: 1, b: "x\ny" }])).toBe('a,b\r\n"say ""hi"", ok",\r\n1,"x\ny"\r\n');
  });
});

describe("dataset SQL", () => {
  const supersetDir = path.resolve(__dirname, "../../../NPHIIS-superset/docker/nphiis-analytics/postgres");
  it.skipIf(!fs.existsSync(supersetDir))("is the same as the Superset datasets'", () => {
    for (const file of ["vhf_line_list.sql", "vhf_contacts.sql"]) {
      const ours = fs.readFileSync(path.resolve(__dirname, "../../sql/vhf", file), "utf8");
      expect(ours, `${file}: copy NPHIIS-superset/.../postgres/${file} to hie-auth/sql/vhf/`).toBe(
        fs.readFileSync(path.join(supersetDir, file), "utf8"),
      );
    }
  });

  it("loads without the trailing semicolon and has no @include to expand", () => {
    for (const ds of ["line-list", "contacts"] as const) {
      expect(datasetSql(ds)).not.toMatch(/;\s*$/);
      expect(datasetSql(ds)).not.toMatch(/^-- @include/m);
    }
  });
});
