import { FhirApi } from "./utils";
import { toRelativeRequestPath } from "./fhir-resource-history";
import { SCREENING_TAG_CODE, SCREENING_TAG_SYSTEM, migrateLegacyScreeningResponse } from "./screening";

export type ScreeningBackfillStats = {
    responses: number;
    /** Rewritten, or (dry run) would be rewritten. */
    migrated: number;
    errors: number;
    dryRun: boolean;
    skippedBecauseAlreadyRunning?: boolean;
};

let backfillRunning = false;

/**
 * Rewrite screening QuestionnaireResponses stored before they used the vhf-case.json linkIds.
 * Responses already in the new shape are skipped, so it can be re-run safely.
 */
export async function backfillScreeningResponses({ dryRun = true } = {}): Promise<ScreeningBackfillStats> {
    if (backfillRunning) return { responses: 0, migrated: 0, errors: 0, dryRun, skippedBecauseAlreadyRunning: true };
    backfillRunning = true;
    try {
        return await migrateAll(dryRun);
    } finally {
        backfillRunning = false;
    }
}

async function migrateAll(dryRun: boolean): Promise<ScreeningBackfillStats> {
    const qrs: any[] = [];
    let next: string | null =
        `/QuestionnaireResponse?_tag=${encodeURIComponent(`${SCREENING_TAG_SYSTEM}|${SCREENING_TAG_CODE}`)}&_count=200`;
    while (next) {
        const bundle: any = (await FhirApi({ url: next })).data;
        for (const e of bundle?.entry ?? []) if (e?.resource?.resourceType === "QuestionnaireResponse") qrs.push(e.resource);
        const link: string | undefined = bundle?.link?.find((l: any) => l.relation === "next")?.url;
        next = link ? toRelativeRequestPath(link) : null;
    }

    let migrated = 0;
    let errors = 0;
    for (const qr of qrs) {
        try {
            const patientRef = qr.subject?.reference;
            const patient = patientRef ? (await FhirApi({ url: `/${patientRef}` })).data : null;
            const updated = migrateLegacyScreeningResponse(qr, patient?.resourceType === "Patient" ? patient : null);
            if (!updated) continue;
            if (dryRun) {
                migrated++;
                continue;
            }
            const r = await FhirApi({
                url: `/QuestionnaireResponse/${qr.id}`,
                method: "PUT",
                data: JSON.stringify(updated),
                // A screening edited since it was read is left for the next run.
                ...(qr.meta?.versionId ? { headers: { "If-Match": `W/"${qr.meta.versionId}"` } } : {}),
            });
            if (r.status !== "success") throw new Error(JSON.stringify(r.data).slice(0, 500));
            migrated++;
        } catch (e) {
            errors++;
            console.error(`[Screening] Backfill failed for QuestionnaireResponse/${qr.id}:`, e);
        }
    }
    return { responses: qrs.length, migrated, errors, dryRun };
}
