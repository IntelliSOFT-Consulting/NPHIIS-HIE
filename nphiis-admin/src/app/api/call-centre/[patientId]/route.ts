import { NextRequest, NextResponse } from "next/server";
import { callCentreError, callCentreSession, callLogFromBody } from "@/lib/call-centre-auth";
import { deleteCallLog, getCallLog, updateCallLog } from "@/lib/fhir-call-centre";

type Context = { params: Promise<{ patientId: string }> };

/** One call log with its answers, to view or edit. */
export async function GET(req: NextRequest, context: Context) {
  const auth = await callCentreSession(req);
  if (auth instanceof NextResponse) return auth;
  const { patientId } = await context.params;
  try {
    return NextResponse.json(await getCallLog(patientId, auth.token));
  } catch (err) {
    return callCentreError("read", err);
  }
}

/** Save an edited call log. */
export async function PUT(req: NextRequest, context: Context) {
  const auth = await callCentreSession(req);
  if (auth instanceof NextResponse) return auth;
  const payload = await callLogFromBody(req, auth.token);
  if (payload instanceof NextResponse) return payload;
  const { patientId } = await context.params;
  try {
    await updateCallLog(patientId, payload, { practitionerId: auth.profile.practitionerId }, auth.token);
    return NextResponse.json({ patientId });
  } catch (err) {
    return callCentreError("update", err);
  }
}

/** Remove a call log from the list (kept in HAPI as inactive). */
export async function DELETE(req: NextRequest, context: Context) {
  const auth = await callCentreSession(req);
  if (auth instanceof NextResponse) return auth;
  const { patientId } = await context.params;
  try {
    await deleteCallLog(patientId, auth.token);
    return NextResponse.json({ patientId, deleted: true });
  } catch (err) {
    return callCentreError("delete", err);
  }
}
