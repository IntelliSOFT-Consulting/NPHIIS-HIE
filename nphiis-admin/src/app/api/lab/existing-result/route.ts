import { NextRequest, NextResponse } from "next/server";
import {
  forbidden,
  resolveUserRoles,
  unauthorized,
  verifyToken,
} from "@/lib/server-auth";
import { canAccess } from "@/lib/roles";
import { findExistingLabResult } from "@/lib/fhir-patient";
import { getLabForm } from "@/lib/questionnaires";

interface RequestBody {
  patientId?: string;
  formId?: string;
}

// Advisory duplicate check for the lab module: does this case already have a
// lab result for the chosen form? Backs the single-entry warning shown before
// recording another result — it warns, it does not block. Detection keys off
// the lab Encounter's reasonCode (form.encounterReason).
export async function POST(req: NextRequest) {
  const session = await verifyToken(req);
  if (!session) return unauthorized();
  const roles = await resolveUserRoles(session);
  if (!canAccess(roles, "LAB_ACCESS")) {
    return forbidden("Lab access required");
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patientId = (body.patientId ?? "").trim();
  const form = body.formId ? getLabForm(body.formId) : undefined;
  if (!patientId || !form) {
    return NextResponse.json(
      { error: "patientId and a known formId are required" },
      { status: 400 },
    );
  }

  try {
    const existing = await findExistingLabResult(
      patientId,
      form.encounterReason,
      session.raw,
    );
    return NextResponse.json({ ...existing, formTitle: form.title });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 },
    );
  }
}
