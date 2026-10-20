import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { contactsError, contactsSession } from "@/lib/contacts-auth";
import {
  alreadyUploaded,
  buildBoard,
  caseDisease,
  findSamePerson,
  postTransaction,
  refreshCaseList,
  reportingSite,
  resolvePlace,
} from "@/lib/fhir-contacts";
import { mapWithConcurrency } from "@/lib/fhir-search";
import { buildContactBundle, buildExtraExposureBundle, contactIds, type ContactInput, type IndexCase } from "@/lib/vhf-contacts";

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

export type UploadAction = "create" | "link-existing" | "exists" | "skip";

export interface UploadRowResult {
  rowNumber: number;
  name: string;
  action: UploadAction;
  residence?: string;
  problems: string[];
  existingName?: string;
  saved?: boolean;
  error?: string;
}

/**
 * Line-list upload for one case. Preview resolves each row's county and sub-county, and finds
 * rows already uploaded for this case or people already registered (as a contact of another
 * case, or a case). Commit creates the new contacts, links people already registered to this
 * case too, and rebuilds the case's contact list.
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
    const onList = new Set(list.contacts.map((c) => c.encounterId));
    const facility = s.profile.locationInfo?.facility
      ? { id: s.profile.locationInfo.facility, name: s.profile.locationInfo.facilityName ?? s.profile.locationInfo.facility }
      : undefined;

    const placeCache = new Map();
    const plans = await mapWithConcurrency(rows, 4, async (row): Promise<{ result: UploadRowResult; input?: ContactInput; existing?: { patientId: string; encounterId: string } }> => {
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
        return { result: { rowNumber: row.rowNumber, name, action: "exists", residence, problems } };
      }
      const same = await findSamePerson(row, s.token);
      if (same) {
        const action: UploadAction = onList.has(same.encounterId) ? "exists" : "link-existing";
        return {
          result: { rowNumber: row.rowNumber, name, action, residence, problems, existingName: same.name },
          existing: same,
          input,
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

    if (commit) {
      const site = await reportingSite(s.profile, s.token);
      await mapWithConcurrency(plans, 3, async (p) => {
        if (!p.input || (p.result.action !== "create" && p.result.action !== "link-existing")) return;
        try {
          const bundle =
            p.result.action === "create"
              ? buildContactBundle(index, p.input, { practitionerId: s.profile.practitionerId, facility, site })
              : buildExtraExposureBundle(index, p.existing!, p.input.contactDate, { practitionerId: s.profile.practitionerId, facility });
          await postTransaction(bundle, s.token);
          p.result.saved = true;
        } catch (err) {
          p.result.error = (err as Error).message;
        }
      });
      const refreshed = await refreshCaseList(s.token, indexEncounterId);
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
