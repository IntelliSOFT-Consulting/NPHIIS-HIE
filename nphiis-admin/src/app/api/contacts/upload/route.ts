import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { contactsError, contactsSession } from "@/lib/contacts-auth";
import {
  alreadyUploaded,
  buildBoard,
  caseDisease,
  findSamePerson,
  latestAnswers,
  patientResources,
  postTransaction,
  refreshCaseList,
  reportingSite,
  resolvePlace,
  type HieContact,
} from "@/lib/fhir-contacts";
import { mapWithConcurrency } from "@/lib/fhir-search";
import {
  buildContactBundle,
  buildContactUpdateBundle,
  buildExtraExposureBundle,
  contactIds,
  contactUpdate,
  ROW_LINK_IDS,
  type ContactInput,
  type ContactOnRecord,
  type ContactUpdate,
  type IndexCase,
} from "@/lib/vhf-contacts";

const MAX_ROWS = 1000;
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const Row = z.object({
  rowNumber: z.number().int(),
  givenNames: z.string(),
  familyName: z.string(),
  sex: z.enum(["male", "female"]).optional(),
  ageYears: z.number().int().min(0).max(120).optional(),
  birthDate: day.optional(),
  phone: z.string().optional(),
  idNumber: z.string().optional(),
  contactDate: day.optional(),
  relationship: z.enum(["family", "hcw", "friend", "workmate", "other"]).optional(),
  relationshipOther: z.string().optional(),
  contactLocation: z.string().optional(),
  exposureLocation: z.string().optional(),
  village: z.string().optional(),
  countyName: z.string().optional(),
  subCountyName: z.string().optional(),
  notes: z.string().optional(),
  followUps: z.array(z.object({ day: z.number().int().min(0).max(21), symptomatic: z.boolean() })).optional(),
});

const Upload = z.object({
  indexEncounterId: z.string().min(1),
  rows: z.array(Row).max(MAX_ROWS),
  /** false: check the rows only (preview); true: save them. */
  commit: z.boolean().default(false),
});

/** "update": on this list already, and the row has something new for it; "exists": nothing new. */
export type UploadAction = "create" | "link-existing" | "restore" | "update" | "exists" | "skip";

export interface UploadRowResult {
  rowNumber: number;
  name: string;
  action: UploadAction;
  residence?: string;
  problems: string[];
  existingName?: string;
  /** What an update (or a put-back) changes: "Phone", "Days 4, 5". */
  changes?: string[];
  saved?: boolean;
  error?: string;
}

interface Plan {
  result: UploadRowResult;
  input?: ContactInput;
  existing?: { patientId: string; encounterId: string };
  /** The contact on this case's list (or taken off it) that the row is. */
  onRecord?: HieContact;
  update?: ContactUpdate;
  record?: ContactOnRecord;
}

/** Follow-up days recorded for a contact: day → symptomatic. */
function recordedDays(c: HieContact): Map<number, boolean> {
  const out = new Map<number, boolean>();
  for (const d of c.days ?? []) {
    if (d.state === "seen") out.set(d.day, false);
    else if (d.state === "symptomatic") out.set(d.day, true);
  }
  return out;
}

/**
 * Line-list upload for one case, as an upsert. Preview resolves each row's county and
 * sub-county and finds rows already on this case's list or people already registered (as a
 * contact of another case, or a case). Commit creates the new contacts, links people already
 * registered to this case too, adds what is new for contacts already on the list (changed
 * details, new follow-up days), and rebuilds the case's contact list.
 */
export async function POST(req: NextRequest) {
  const s = await contactsSession(req);
  if (s instanceof NextResponse) return s;
  const parsed = Upload.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid upload" }, { status: 400 });
  }
  const { indexEncounterId, rows, commit } = parsed.data;

  try {
    const list = await refreshCaseList(s.token, indexEncounterId);
    const epid = list.indexCase.epid ?? list.indexCase.caseId;
    if (!epid) return NextResponse.json({ error: "This case has no EPID yet; contacts are linked by it" }, { status: 409 });
    if (list.indexCase.caseType === "contact") {
      return NextResponse.json({ error: "This record is itself a contact; add contacts to the case it was exposed to" }, { status: 409 });
    }
    const index: IndexCase = {
      encounterId: list.indexCase.encounterId,
      patientId: list.indexCase.patientId ?? "",
      epid,
      disease: await caseDisease(indexEncounterId, s.token),
    };
    const onList = new Map(list.contacts.map((c) => [c.encounterId, c]));
    // Taken off this case's list before: saving puts them back.
    const offList = new Map((list.removed ?? []).map((c) => [c.encounterId, c]));
    const facility = s.profile.locationInfo?.facility
      ? { id: s.profile.locationInfo.facility, name: s.profile.locationInfo.facilityName ?? s.profile.locationInfo.facility }
      : undefined;

    const placeCache = new Map();
    const plans = await mapWithConcurrency(rows, 4, async (row): Promise<Plan> => {
      const name = `${row.givenNames} ${row.familyName}`.trim() || "(no name)";
      const problems: string[] = [];
      if (!row.givenNames.trim() && !row.familyName.trim()) {
        return { result: { rowNumber: row.rowNumber, name, action: "skip", problems: ["No name"] } };
      }
      const place = await resolvePlace(row.countyName, row.subCountyName, s.token, placeCache);
      if (place.problem) problems.push(place.problem);
      const { countyName: _c, subCountyName: _s, ...rest } = row;
      const input: ContactInput = { ...rest, county: place.county, subCounty: place.subCounty };
      const residence = [place.subCounty?.name, place.county?.name].filter(Boolean).join(", ") || undefined;

      const ids = contactIds(index, input);
      if (onList.has(ids.encounterId)) {
        return { result: { rowNumber: row.rowNumber, name, action: "exists", residence, problems }, input, onRecord: onList.get(ids.encounterId) };
      }
      if (offList.has(ids.encounterId)) {
        return { result: { rowNumber: row.rowNumber, name, action: "restore", residence, problems }, input, onRecord: offList.get(ids.encounterId) };
      }
      const same = await findSamePerson(row, s.token);
      if (same) {
        const onRecord = onList.get(same.encounterId) ?? offList.get(same.encounterId);
        const action: UploadAction = onList.has(same.encounterId) ? "exists" : offList.has(same.encounterId) ? "restore" : "link-existing";
        return {
          result: { rowNumber: row.rowNumber, name, action, residence, problems, existingName: same.name },
          existing: same,
          input,
          onRecord,
        };
      }
      return { result: { rowNumber: row.rowNumber, name, action: "create", residence, problems }, input };
    });

    // Rows already saved under this case (same derived ids) that are not on the list yet.
    const toCheck = plans.filter((p) => p.result.action === "create" && p.input).map((p) => p.input!);
    const existingIds = await alreadyUploaded(index, toCheck, s.token);
    for (const p of plans) {
      if (p.result.action === "create" && p.input && existingIds.has(contactIds(index, p.input).encounterId)) {
        p.result.action = "exists";
      }
    }

    // Contacts already on (or taken off) this list: what the row adds to them.
    const known = plans.filter((p) => p.onRecord && p.input);
    const answers = await latestAnswers(
      known.map((p) => p.onRecord!.encounterId),
      ROW_LINK_IDS,
      s.token,
    );
    for (const p of known) {
      const c = p.onRecord!;
      p.record = {
        patientId: c.patientId,
        encounterId: c.encounterId,
        answers: answers.get(c.encounterId) ?? new Map(),
        followUps: recordedDays(c),
        dayZero: c.dayZero || c.exposureDate || undefined,
      };
      p.update = contactUpdate(index, p.input!, p.record);
      if (p.update.changes.length) {
        p.result.changes = p.update.changes;
        if (p.result.action === "exists") p.result.action = "update";
      }
    }

    if (commit) {
      const site = await reportingSite(s.profile, s.token);
      const opts = { practitionerId: s.profile.practitionerId, facility };
      const updating = plans.filter((p) => p.record && p.update?.changes.length && (p.result.action === "update" || p.result.action === "restore"));
      const patients = await patientResources(updating.map((p) => p.record!.patientId), s.token);
      const restore = plans
        .filter((p) => p.result.action === "restore")
        .map((p) => p.existing?.encounterId ?? contactIds(index, p.input!).encounterId);
      await mapWithConcurrency(plans, 3, async (p) => {
        if (!p.input) return;
        try {
          if (p.result.action === "create") {
            await postTransaction(buildContactBundle(index, p.input, { ...opts, site }), s.token);
          } else if (p.result.action === "link-existing") {
            await postTransaction(buildExtraExposureBundle(index, p.existing!, p.input.contactDate, opts), s.token);
          } else if (updating.includes(p)) {
            const bundle = buildContactUpdateBundle(p.record!, patients.get(p.record!.patientId) ?? null, p.input, p.update!, opts);
            if (bundle) await postTransaction(bundle, s.token);
          } else {
            return;
          }
          p.result.saved = true;
        } catch (err) {
          p.result.error = (err as Error).message;
        }
      });
      const refreshed = await refreshCaseList(s.token, indexEncounterId, { restore });
      for (const p of plans) if (p.result.action === "restore" && !p.result.error) p.result.saved = true;
      return NextResponse.json({
        results: plans.map((p) => p.result),
        board: await buildBoard(refreshed, s.token, s.scope),
      });
    }
    return NextResponse.json({ results: plans.map((p) => p.result) });
  } catch (err) {
    return contactsError("upload", err);
  }
}
