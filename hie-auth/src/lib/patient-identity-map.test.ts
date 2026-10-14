import { describe, expect, it } from "vitest";
import {
    CLIENT_REGISTRY_PATIENT_PROFILE,
    IPRS_PATIENT_PROFILE,
} from "./identification-types";
import {
    mapCrResponseToPatient,
    mapIprsResponseToPatient,
    unwrapPatientPayload,
} from "./patient-identity-map";

describe("unwrapPatientPayload", () => {
    it("unwraps results arrays", () => {
        expect(unwrapPatientPayload({ results: [{ first_name: "A" }] })).toEqual({
            first_name: "A",
        });
    });

    it("returns the object itself when already flat", () => {
        expect(unwrapPatientPayload({ first_name: "B" })).toEqual({ first_name: "B" });
    });
});

describe("mapCrResponseToPatient", () => {
    it("maps CR demographics onto ClientRegistryPatient", () => {
        const patient = mapCrResponseToPatient(
            {
                first_name: "Jane",
                last_name: "Doe",
                gender: "F",
                date_of_birth: "15/03/1990",
                phone: "0712345678",
                identification_number: "12345678",
            },
            "12345678",
            "National ID",
        );

        expect(patient.resourceType).toBe("Patient");
        expect(patient.meta.profile).toEqual([CLIENT_REGISTRY_PATIENT_PROFILE]);
        expect(patient.identifier[0].value).toBe("12345678");
        expect(patient.identifier[0].type?.text).toBe("National ID");
        expect(patient.name?.[0].family).toBe("Doe");
        expect(patient.name?.[0].given).toEqual(["Jane"]);
        expect(patient.gender).toBe("female");
        expect(patient.birthDate).toBe("1990-03-15");
        expect(patient.telecom?.[0]).toEqual({ system: "phone", value: "0712345678" });
    });
});

describe("mapIprsResponseToPatient", () => {
    it("maps IPRS demographics onto IprsPatient", () => {
        const patient = mapIprsResponseToPatient(
            { results: [{ firstName: "John", surname: "Smith", sex: "Male" }] },
            "87654321",
            "National ID",
        );

        expect(patient.meta.profile).toEqual([IPRS_PATIENT_PROFILE]);
        expect(patient.identifier[0].value).toBe("87654321");
        expect(patient.name?.[0].family).toBe("Smith");
        expect(patient.name?.[0].given).toEqual(["John"]);
        expect(patient.gender).toBe("male");
    });
});
