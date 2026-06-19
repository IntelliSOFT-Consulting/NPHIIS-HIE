import { describe, expect, it } from "vitest";
import { fhirApiDefaultHeaders } from "./utils";

describe("fhirApiDefaultHeaders", () => {
  it("includes Accept-Encoding identity to avoid gzip decompression issues", () => {
    expect(fhirApiDefaultHeaders()["Accept-Encoding"]).toBe("identity");
  });

  it("merges extra headers without dropping defaults", () => {
    const headers = fhirApiDefaultHeaders({ Authorization: "Bearer test" });
    expect(headers["Accept-Encoding"]).toBe("identity");
    expect(headers.Authorization).toBe("Bearer test");
  });
});
