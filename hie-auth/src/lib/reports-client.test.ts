import { beforeEach, describe, expect, it } from "vitest";
import { reportsClientIds, reportsClientOf } from "./reports-client";

const jwt = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;

beforeEach(() => {
    process.env.REPORTS_CLIENT_IDS = " partner-reports ,, other-system ";
});

describe("reportsClientIds", () => {
    it("splits and trims, dropping blanks", () => {
        expect(reportsClientIds()).toEqual(["partner-reports", "other-system"]);
    });

    it("is empty when unset", () => {
        delete process.env.REPORTS_CLIENT_IDS;
        expect(reportsClientIds()).toEqual([]);
    });
});

describe("reportsClientOf", () => {
    const sa = { preferred_username: "service-account-partner-reports" };

    it("names a listed client's service account token", () => {
        expect(reportsClientOf(jwt({ azp: "partner-reports" }), sa)).toBe("partner-reports");
    });

    it("null for an unlisted client", () => {
        expect(reportsClientOf(jwt({ azp: "hie-auth" }), { preferred_username: "service-account-hie-auth" })).toBeNull();
    });

    it("null for a person, even one who logged in through a listed client", () => {
        expect(reportsClientOf(jwt({ azp: "partner-reports" }), { preferred_username: "12345678" })).toBeNull();
    });

    it("null for a malformed token", () => {
        expect(reportsClientOf("not-a-jwt", sa)).toBeNull();
    });
});
