import { NextRequest, NextResponse } from "next/server";
import {
  forbidden,
  resolveUserRoles,
  unauthorized,
  verifyToken,
} from "@/lib/server-auth";
import { canAccess } from "@/lib/roles";
import {
  getPatientRecordType,
  lookupPatientByEpid,
  sampleEpidValues,
} from "@/lib/fhir-patient";
import {
  formsForDisease,
  inferDiseaseFromEpid,
} from "@/lib/lab-submission";

interface RequestBody {
  epid?: string;
}

// Confirms an EPID belongs to a registered *case* before the UI unlocks the
// lab-results form. The record type is stored as an Observation on the
// patient (linkId 865158268604 from the mobile add-case questionnaire) with
// valueString of "Case" or "Line List"; we only accept "Case".
export async function POST(req: NextRequest) {
  const session = await verifyToken(req);
  if (!session) return unauthorized();
  const roles = await resolveUserRoles(session);
  if (!canAccess(roles, "LAB_ACCESS")) {
    console.warn(
      "[lab/verify-epid] LAB_ACCESS denied; resolved roles =",
      roles,
    );
    return forbidden("Lab access required");
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const epid = (body.epid ?? "").trim();
  if (!epid) {
    return NextResponse.json({ error: "EPID is required" }, { status: 400 });
  }

  try {
    const result = await lookupPatientByEpid(epid, session.raw);
    if (result.kind === "not-found") {
      const samples = await sampleEpidValues(session.raw, 3).catch(() => []);
      const hint =
        samples.length === 0
          ? "The server has no EPID records yet — check that mobile entries have synced to this HAPI instance."
          : `Examples of EPIDs currently on this server: ${samples.join(", ")}`;
      return NextResponse.json(
        { error: `No patient found for this EPID. ${hint}` },
        { status: 404 },
      );
    }

    const recordType = await getPatientRecordType(
      result.patient.id,
      session.raw,
    );
    if (recordType === "line-list") {
      return NextResponse.json(
        {
          error:
            "This EPID belongs to a line-list entry, not a case. Lab results can only be attached to cases.",
        },
        { status: 400 },
      );
    }

    const disease = inferDiseaseFromEpid(epid);
    const suggestedForms = formsForDisease(disease);
    return NextResponse.json({
      epid,
      patient: result.patient,
      recordType,
      disease,
      suggestedForms,
      // Also surfaced at top level for caller convenience.
      caseEncounterId: result.patient.caseEncounterId,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 },
    );
  }
}
