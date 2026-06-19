import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  NOT_RECORDED,
  formatHumanName,
  formatKeycloakName,
  formatRoleLabel,
  practitionerIdFromReference,
  resolveCaseSubmitterInfo,
  resolveCaseSubmitterPractitionerId,
} from "./case-submitter";

vi.mock("./utils", () => ({
  FhirApi: vi.fn(),
}));

vi.mock("./keycloak", () => ({
  getKeycloakUserById: vi.fn(),
}));

vi.mock("./practitioner-role", () => ({
  resolvePractitionerAssignment: vi.fn(),
}));

import { FhirApi } from "./utils";
import { getKeycloakUserById } from "./keycloak";
import { resolvePractitionerAssignment } from "./practitioner-role";

const mockFhirApi = vi.mocked(FhirApi);
const mockGetKeycloakUserById = vi.mocked(getKeycloakUserById);
const mockResolvePractitionerAssignment = vi.mocked(resolvePractitionerAssignment);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("practitionerIdFromReference", () => {
  it("extracts id from Practitioner reference", () => {
    expect(practitionerIdFromReference("Practitioner/abc-123")).toBe("abc-123");
  });

  it("returns null for non-Practitioner references", () => {
    expect(practitionerIdFromReference("Patient/abc")).toBeNull();
    expect(practitionerIdFromReference(null)).toBeNull();
  });
});

describe("formatHumanName", () => {
  it("joins given names and family", () => {
    expect(formatHumanName({ given: ["Jane", "Mary"], family: "Doe" })).toBe(
      "Jane Mary Doe",
    );
  });

  it("returns null when name is empty", () => {
    expect(formatHumanName({ given: [], family: "" })).toBeNull();
  });
});

describe("formatKeycloakName", () => {
  it("joins first and last name", () => {
    expect(formatKeycloakName({ firstName: "Jane", lastName: "Doe" })).toBe("Jane Doe");
  });
});

describe("formatRoleLabel", () => {
  it("formats underscore role codes", () => {
    expect(formatRoleLabel("COUNTY_DISEASE_SURVEILLANCE_OFFICER")).toBe(
      "County Disease Surveillance Officer",
    );
  });

  it("returns Not recorded for empty role", () => {
    expect(formatRoleLabel("")).toBe(NOT_RECORDED);
    expect(formatRoleLabel(null)).toBe(NOT_RECORDED);
  });
});

describe("resolveCaseSubmitterInfo", () => {
  it("resolves name, role, and facility from encounter participant", async () => {
    const encounter = {
      id: "enc-1",
      participant: [
        {
          individual: {
            reference: "Practitioner/prac-1",
            display: "Jane Doe",
          },
        },
      ],
      location: [{ location: { display: "Meru District Hospital" } }],
    };

    mockFhirApi.mockImplementation(async ({ url }: { url: string }) => {
      if (url === "/Practitioner/prac-1") {
        return {
          status: "success",
          statusText: "OK",
          data: {
            resourceType: "Practitioner",
            id: "prac-1",
            name: [{ given: ["Jane"], family: "Doe" }],
          },
        };
      }
      return { status: "success", statusText: "OK", data: { entry: [] } };
    });

    mockGetKeycloakUserById.mockResolvedValue({
      attributes: { practitionerRole: ["FACILITY_SURVEILLANCE_FOCAL_PERSON"] },
    });

    const info = await resolveCaseSubmitterInfo(encounter, "enc-1");
    expect(info).toEqual({
      name: "Jane Doe",
      role: "Facility Surveillance Focal Person",
      facility: "Meru District Hospital",
    });
  });

  it("falls back to QuestionnaireResponse author when participant is missing", async () => {
    const encounter = { id: "enc-2" };

    mockFhirApi.mockImplementation(async ({ url }: { url: string }) => {
      if (url.includes("QuestionnaireResponse")) {
        return {
          status: "success",
          statusText: "OK",
          data: {
            entry: [
              {
                resource: {
                  author: { reference: "Practitioner/prac-2" },
                },
              },
            ],
          },
        };
      }
      if (url === "/Practitioner/prac-2") {
        return {
          status: "success",
          statusText: "OK",
          data: {
            resourceType: "Practitioner",
            id: "prac-2",
            name: [{ given: ["John"], family: "Smith" }],
          },
        };
      }
      if (url.includes("Observation")) {
        return { status: "success", statusText: "OK", data: { entry: [] } };
      }
      return { status: "success", statusText: "OK", data: { entry: [] } };
    });

    mockGetKeycloakUserById.mockResolvedValue(null);
    mockResolvePractitionerAssignment.mockResolvedValue({
      role: "NURSE",
      locationReference: "Location/fac-1",
      locationDisplay: "Kisumu Health Centre",
      source: "PractitionerRole",
    });

    const info = await resolveCaseSubmitterInfo(encounter, "enc-2");
    expect(info.name).toBe("John Smith");
    expect(info.role).toBe("Nurse");
    expect(info.facility).toBe("Kisumu Health Centre");
  });

  it("returns Not recorded when practitioner cannot be resolved", async () => {
    const encounter = { id: "enc-3" };

    mockFhirApi.mockResolvedValue({
      status: "success",
      statusText: "OK",
      data: { entry: [] },
    });

    const info = await resolveCaseSubmitterInfo(encounter, "enc-3");
    expect(info).toEqual({
      name: NOT_RECORDED,
      role: NOT_RECORDED,
      facility: NOT_RECORDED,
    });
  });
});

describe("resolveCaseSubmitterPractitionerId", () => {
  it("returns practitioner id from encounter participant", async () => {
    const encounter = {
      id: "enc-1",
      participant: [
        { individual: { reference: "Practitioner/prac-99", display: "Test User" } },
      ],
    };

    mockFhirApi.mockResolvedValue({
      status: "success",
      statusText: "OK",
      data: { entry: [] },
    });

    const result = await resolveCaseSubmitterPractitionerId(encounter, "enc-1");
    expect(result).toEqual({
      practitionerId: "prac-99",
      displayName: "Test User",
    });
  });
});
