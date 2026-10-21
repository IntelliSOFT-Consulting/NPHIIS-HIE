import express, { Request, Response } from "express";
import { authenticateUser } from "../lib/middleware";
import { findKeycloakUser } from "../lib/keycloak";
import { resolvePractitionerAssignment } from "../lib/practitioner-role";
import { buildLocationInfo, FhirApi } from "../lib/utils";
import {
    ReportingSite,
    SCREENING_ID_SYSTEM,
    SCREENING_TAG_CODE,
    SCREENING_TAG_SYSTEM,
    buildScreenedPatient,
    buildScreeningQuestionnaireResponse,
    facilityTypeOf,
    mergeIntoExistingPatient,
    patientHasIdentifier,
    reportingSiteFromLocationInfo,
    validateScreeningPayload,
} from "../lib/screening";

const router = express.Router();
router.use(express.json({ limit: "1mb" }));

const entries = (bundle: any): any[] => (bundle?.entry ?? []).map((e: any) => e.resource).filter(Boolean);

/**
 * HAPI reuses identical search results for 60s by default, so a lookup made just
 * before a create would keep answering "not found" and a retry would create a duplicate.
 * Searches that decide whether to create something must bypass that cache.
 */
const FRESH_SEARCH = { "Cache-Control": "no-cache" };

/** Find Patients already holding any of the supplied identifiers (type + number). */
async function findMatchingPatients(identifiers: Array<{ type: any; value: string }>) {
    const found = new Map<string, any>();
    for (const id of identifiers) {
        const resp = await FhirApi({
            url: `/Patient?identifier=${encodeURIComponent(id.value.trim())}&_count=20`,
            headers: FRESH_SEARCH,
        });
        if (resp.status !== "success") throw new Error("Patient search failed");
        for (const p of entries(resp.data)) {
            if (p.resourceType === "Patient" && patientHasIdentifier(p, id.type, id.value)) found.set(p.id, p);
        }
    }
    return [...found.values()];
}

const HIERARCHY = [
    { country: "COUNTRY" },
    { county: "COUNTY" },
    { subCounty: "SUB-COUNTY" },
    { ward: "WARD" },
    { facility: "FACILITY" },
];

/**
 * The screener's reporting site: their role and the location info of their assigned location,
 * as /provider/me builds it. Undefined when it cannot be looked up; the screening is still saved.
 */
async function screenerReportingSite(username: string | undefined): Promise<ReportingSite | undefined> {
    try {
        if (!username) return undefined;
        const user = await findKeycloakUser(username);
        if (!user?.id) return undefined;
        const assignment = await resolvePractitionerAssignment(user.id);
        if (!assignment) return undefined;
        let info: Awaited<ReturnType<typeof buildLocationInfo>> | undefined;
        let location: any;
        if (assignment.locationReference) {
            location = (await FhirApi({ url: `/${assignment.locationReference}` })).data;
            if (location?.type?.[0]?.coding?.[0]?.code) info = await buildLocationInfo(location, HIERARCHY);
        }
        const facility = !info?.facility
            ? undefined
            : location?.id === info.facility
              ? location
              : (await FhirApi({ url: `/Location/${encodeURIComponent(info.facility)}` })).data;
        return reportingSiteFromLocationInfo(assignment.role ?? undefined, info, facilityTypeOf(facility));
    } catch (error) {
        console.warn("[screenings] reporting site lookup failed:", (error as Error).message);
        return undefined;
    }
}

/**
 * Receive a screened person: match/create the Patient, then store the screening
 * (reporting site, point of entry, travel history, signs & symptoms) as a QuestionnaireResponse
 * linked to it. The reporting site is the screener's role and assigned location.
 * Idempotent on `screeningId`.
 */
router.post("/", authenticateUser, async (req: Request, res: Response) => {
    try {
        const parsed = validateScreeningPayload(req.body);
        if (!parsed.ok) return res.status(400).json({ status: "error", errors: parsed.errors });
        const payload = parsed.value;

        // Idempotency: a retried submission returns the original result
        const prior = await FhirApi({
            url: `/QuestionnaireResponse?identifier=${encodeURIComponent(`${SCREENING_ID_SYSTEM}|${payload.screeningId}`)}`,
            headers: FRESH_SEARCH,
        });
        if (prior.status !== "success") return res.status(502).json({ status: "error", error: "FHIR server unavailable" });
        const existingQr = entries(prior.data)[0];
        if (existingQr) {
            return res.status(200).json({
                status: "success",
                duplicate: true,
                patientId: existingQr.subject?.reference?.replace("Patient/", ""),
                questionnaireResponseId: existingQr.id,
            });
        }

        const matches = await findMatchingPatients(payload.patient.identifiers);
        if (matches.length > 1) {
            return res.status(409).json({
                status: "error",
                error: "Identifiers match more than one existing patient; resolve the duplicate first",
                patientIds: matches.map((m) => m.id),
            });
        }

        const incoming = buildScreenedPatient(payload.patient, payload.screeningNumber ?? payload.screeningId);
        let patient: any;
        let patientCreated = false;
        if (matches.length === 1) {
            const merged = mergeIntoExistingPatient(matches[0], incoming);
            const upd = await FhirApi({
                url: `/Patient/${matches[0].id}`,
                method: "PUT",
                data: JSON.stringify(merged),
            });
            if (upd.status !== "success") return res.status(502).json({ status: "error", error: "Failed to update patient" });
            patient = upd.data;
        } else {
            const created = await FhirApi({ url: "/Patient", method: "POST", data: JSON.stringify(incoming) });
            if (created.status !== "success") return res.status(502).json({ status: "error", error: "Failed to create patient" });
            patient = created.data;
            patientCreated = true;
        }

        const site = await screenerReportingSite((req as any).user?.preferred_username);
        const qr = buildScreeningQuestionnaireResponse(payload, patient.id, site);
        const savedQr = await FhirApi({
            url: "/QuestionnaireResponse",
            method: "POST",
            data: JSON.stringify(qr),
            // Guards against two concurrent submissions of the same screeningId
            headers: { "If-None-Exist": `identifier=${SCREENING_ID_SYSTEM}|${payload.screeningId}` },
        });
        if (savedQr.status !== "success") {
            return res.status(502).json({
                status: "error",
                error: "Patient saved but screening could not be stored; retry with the same screeningId",
                patientId: patient.id,
            });
        }

        return res.status(patientCreated ? 201 : 200).json({
            status: "success",
            duplicate: false,
            patientCreated,
            patientId: patient.id,
            questionnaireResponseId: savedQr.data?.id,
        });
    } catch (error) {
        console.error("POST /provider/screenings error:", error);
        return res.status(500).json({ status: "error", error: "Failed to record screening" });
    }
});

/**
 * List screened patients. Query: outcome, _count, _offset, name, identifier.
 * Equivalent FHIR search via the proxy: GET /fhir/Patient?_tag=<system>|screened
 */
router.get("/patients", authenticateUser, async (req: Request, res: Response) => {
    try {
        const params = new URLSearchParams();
        params.set("_tag", `${SCREENING_TAG_SYSTEM}|${SCREENING_TAG_CODE}`);
        params.set("_count", String(Math.min(Number(req.query._count) || 50, 200)));
        for (const k of ["_offset", "name", "identifier", "_sort"]) {
            if (typeof req.query[k] === "string") params.set(k, req.query[k] as string);
        }
        const resp = await FhirApi({ url: `/Patient?${params.toString()}` });
        if (resp.status !== "success") return res.status(502).json({ status: "error", error: "FHIR search failed" });
        return res.status(200).json(resp.data);
    } catch (error) {
        console.error("GET /provider/screenings/patients error:", error);
        return res.status(500).json({ status: "error", error: "Failed to list screened patients" });
    }
});

export default router;
