import { describe, expect, it } from "vitest";
import { canViewAnalyticsPii, expandSupersetJinja, maskPiiRows } from "./pii-columns";

describe("canViewAnalyticsPii", () => {
  it("is true only for ADMINISTRATOR", () => {
    expect(canViewAnalyticsPii(["ADMINISTRATOR"])).toBe(true);
    expect(canViewAnalyticsPii(["ADMINISTRATOR", "SUPERUSER"])).toBe(true);
    expect(canViewAnalyticsPii(["SUPERUSER"])).toBe(false);
    expect(canViewAnalyticsPii(["NATIONAL_FOCAL_PERSON"])).toBe(false);
    expect(canViewAnalyticsPii([])).toBe(false);
  });
});

describe("maskPiiRows", () => {
  it("leaves rows alone for ADMINISTRATOR", () => {
    const rows = [{ EPID: "E1", "Patient Name": "Ada", Phone: "07" }];
    maskPiiRows(rows, ["ADMINISTRATOR"], ["Patient Name", "Phone"]);
    expect(rows[0]["Patient Name"]).toBe("Ada");
  });

  it("nulls identifier columns for everyone else", () => {
    const rows = [{ EPID: "E1", "Patient Name": "Ada", Phone: "07" }];
    maskPiiRows(rows, ["SUPERUSER"], ["Patient Name", "Phone"]);
    expect(rows[0]).toEqual({ EPID: "E1", "Patient Name": null, Phone: null });
  });
});

describe("expandSupersetJinja", () => {
  it("expands PII Jinja to the identifiable SQL branch", () => {
    expect(expandSupersetJinja(`CASE WHEN {{ can_view_pii() | tojson }} THEN name END`)).toBe(
      "CASE WHEN true THEN name END",
    );
    expect(expandSupersetJinja("{% if can_view_pii() %}name{% else %}NULL{% endif %} AS x")).toBe(
      "name AS x",
    );
    expect(
      expandSupersetJinja(
        "{% if cache_key_wrapper is defined %}{% set _ = cache_key_wrapper('pii:' ~ (can_view_pii()|string)) %}{% endif %}\nSELECT 1",
      ),
    ).toBe("\nSELECT 1");
  });
});
