import { describe, expect, it, vi } from "vitest";
vi.mock("./utils", () => ({ FhirApi: vi.fn() }));
import { pickRoot } from "./root-location";

const loc = (id: string, name: string, partOf?: string) => ({
    resource: { resourceType: "Location", id, name, ...(partOf ? { partOf: { reference: partOf } } : {}) },
});

describe("pickRoot", () => {
    it("takes the country that is part of nothing", () => {
        expect(pickRoot({ entry: [loc("42", "Atlantis", "Location/0"), loc("0", "Kenya")] })).toEqual({ id: "0", name: "Kenya" });
    });
    it("is null when there is no root", () => {
        expect(pickRoot({ entry: [loc("42", "Atlantis", "Location/0")] })).toBeNull();
        expect(pickRoot({})).toBeNull();
    });
});
