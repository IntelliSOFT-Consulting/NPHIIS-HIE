import express, { Request, Response } from "express";
import { authenticateUser } from "../lib/middleware";
import { FhirApi } from "../lib/utils";
import {
    SCREENING_ID_SYSTEM,
    SCREENING_TAG_CODE,
    SCREENING_TAG_SYSTEM,
    buildScreenedPatient,
    buildScreeningQuestionnaireResponse,
    mergeIntoExistingPatient,
    patientHasIdentifier,
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

/**
 * Receive a screened person: match/create the Patient, then store the screening
 * (point of entry, travel history, signs & symptoms) as a QuestionnaireResponse linked to it.
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

        const incoming = buildScreenedPatient(payload.patient);
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

        const qr = buildScreeningQuestionnaireResponse(payload, patient.id);
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
