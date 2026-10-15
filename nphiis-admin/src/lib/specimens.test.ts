import { describe, expect, it } from "vitest";
import { describePull } from "./specimens";

describe("describePull", () => {
  it("summarises both sources", () => {
    expect(
      describePull({
        nphl: { cases: 3, errors: 0 },
        staging: { rows: 10, open: 3, updates: 2, matched: 1 },
      }),
    ).toEqual({ ok: true, message: "Checked 3 open cases with NPHL; 1 result from the lab staging API." });
  });

  it("warns when some cases could not be sent", () => {
    const r = describePull({ nphl: { cases: 1, errors: 1 }, staging: { skipped: "not configured" } });
    expect(r).toEqual({ ok: false, message: "Checked 1 open case with NPHL; 1 could not be sent (see each row's status)." });
  });

  it("reports a staging failure and a pull already running", () => {
    const r = describePull({ nphl: { busy: true }, staging: { error: "timeout" } });
    expect(r.ok).toBe(false);
    expect(r.message).toBe("An NPHL pull is already running; Lab staging API failed: timeout.");
  });

  it("says so when nothing is configured", () => {
    expect(describePull({ nphl: { skipped: "x" }, staging: { skipped: "y" } }).ok).toBe(false);
  });
});
