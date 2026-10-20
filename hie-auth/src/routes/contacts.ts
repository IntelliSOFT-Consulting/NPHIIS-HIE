import express, { Request, Response } from "express";
import { NotificationType } from "@prisma/client";
import { authenticateUser } from "../lib/middleware";
import { requireInternalApiKeyOrAdminBearer } from "../middleware/internal-api-key-or-admin";
import { prisma } from "../lib/prisma";
import { getEpidValueFromEncounter } from "../lib/epid-utils";
import { getCaseId } from "../lib/vhf-case-id";
import { promoteConvertedVhfContact } from "../lib/epid-assignment";
import { vhfCaseTypeForEncounter } from "../lib/vhf-contact";
import { contactFollowUp, kenyaToday } from "../lib/vhf-contact-status";
import { findCaseEncounter, loadContactRecord, upsertContactList } from "../lib/vhf-contact-list";
import { contactIdOrNull, runVhfContactDailyJob, sendVhfContactReminders } from "../lib/vhf-contact-reminders";

/**
 * VHF contact tracing (mounted at /provider/contacts): a case's contact List with each
 * contact's 21-day follow-up, for the admin board (through its /api/provider proxy) and mobile.
 */
const router = express.Router();
router.use(express.json({ limit: "1mb" }));

function practitionerIdForUser(req: Request): string | undefined {
  const u = (req as any).user;
  return u?.attributes?.fhirPractitionerId?.[0] ?? u?.id ?? u?.sub;
}

function fail(res: Response, error: unknown, status = 500) {
  console.error("[VhfContacts]", error);
  return res.status(status).json({ status: "error", error: error instanceof Error ? error.message : String(error) });
}

async function listResponse(indexEncounterId: string, changes: { remove?: string[]; restore?: string[] } = {}) {
  const result = await upsertContactList(indexEncounterId, { ...changes, ensureContactId: contactIdOrNull });
  const index = result.indexEncounter;
  return {
    status: "success",
    indexCase: {
      encounterId: index.id,
      patientId: index.subject?.reference?.split("/")[1] ?? null,
      epid: getEpidValueFromEncounter(index) ?? null,
      caseId: getCaseId(index) ?? null,
      caseType: await vhfCaseTypeForEncounter(index.id),
    },
    list: result.list,
    contacts: result.contacts,
    removed: result.removed,
  };
}

/** Contacts of the case with this EPID or Case ID: GET /provider/contacts/case?id=KEN-2026-001 */
router.get("/case", authenticateUser, async (req: Request, res: Response) => {
  try {
    const id = String(req.query.id ?? "").trim();
    if (!id) return res.status(400).json({ status: "error", error: "id (EPID or Case ID) is required" });
    const index = await findCaseEncounter(id);
    if (!index) return res.status(404).json({ status: "error", error: `No VHF case with EPID or Case ID ${id}` });
    return res.json(await listResponse(index.id));
  } catch (e) {
    return fail(res, e);
  }
});

/**
 * Rebuilds a case's List now (e.g. after an upload). Body { remove?: string[], restore?: string[] }:
 * contact Encounters to take off the list, or to put back on it.
 */
router.post("/lists/:indexEncounterId", authenticateUser, async (req: Request, res: Response) => {
  try {
    const ids = (v: unknown) => (Array.isArray(v) ? v.map(String) : undefined);
    return res.json(await listResponse(req.params.indexEncounterId, { remove: ids(req.body?.remove), restore: ids(req.body?.restore) }));
  } catch (e) {
    return fail(res, e);
  }
});

/** The caller's contacts due for follow up today (reminders queued by the daily job). */
router.get("/due", authenticateUser, async (req: Request, res: Response) => {
  try {
    const practitionerId = practitionerIdForUser(req);
    if (!practitionerId) return res.status(401).json({ status: "error", error: "No practitioner for this user" });
    const today = new Date(`${kenyaToday()}T00:00:00+03:00`);
    const rows = await prisma.notification.findMany({
      where: { practitionerId, type: NotificationType.VHF_CONTACT_FOLLOW_UP, dueDate: today },
      orderBy: { createdAt: "asc" },
    });
    return res.json({
      status: "success",
      due: rows.map((r) => ({ encounterId: r.encounterId, followUpDay: r.followUpDay, title: r.title, body: r.body })),
    });
  } catch (e) {
    return fail(res, e);
  }
});

/** Runs the daily job (Lists, conversions, reminders) now; internal key or admin only. */
router.post("/run-daily", requireInternalApiKeyOrAdminBearer, async (req: Request, res: Response) => {
  try {
    const summary = await runVhfContactDailyJob();
    const reminders = req.query.send === "true" ? await sendVhfContactReminders() : undefined;
    return res.json({ status: "success", summary, reminders });
  } catch (e) {
    return fail(res, e);
  }
});

/** One contact's follow-up state. */
router.get("/:encounterId/status", authenticateUser, async (req: Request, res: Response) => {
  try {
    const loaded = await loadContactRecord(req.params.encounterId);
    if (!loaded) return res.status(404).json({ status: "error", error: "Contact record not found" });
    return res.json({ status: "success", followUp: contactFollowUp(loaded.record, kenyaToday()) });
  } catch (e) {
    return fail(res, e);
  }
});

/**
 * After a contact's "Type of case" was changed (convert to case): assigns its Case ID, syncs
 * it to NPHL and sends the case alert now, then refreshes the source case's List.
 */
router.post("/:encounterId/converted", authenticateUser, async (req: Request, res: Response) => {
  try {
    const promoted = await promoteConvertedVhfContact(req.params.encounterId);
    const indexEncounterId = req.body?.indexEncounterId ? String(req.body.indexEncounterId) : null;
    const list = indexEncounterId ? await listResponse(indexEncounterId) : undefined;
    if (promoted.kind === "error") return fail(res, promoted.error);
    return res.json({ status: "success", promoted, ...(list ? { list } : {}) });
  } catch (e) {
    return fail(res, e);
  }
});

export default router;
