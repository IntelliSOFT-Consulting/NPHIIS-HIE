import { NextRequest, NextResponse } from "next/server";
import { callCentreError, callCentreSession, callLogFromBody } from "@/lib/call-centre-auth";
import { createCallLog, listCallLogs } from "@/lib/fhir-call-centre";
import { parsePaging } from "@/lib/pagination";

/** One page of call logs from the whole country. */
export async function GET(req: NextRequest) {
  const auth = await callCentreSession(req);
  if (auth instanceof NextResponse) return auth;

  const params = req.nextUrl.searchParams;
  const search = (params.get("q") ?? "").trim();
  const risk = params.get("risk") ?? "";
  const source = params.get("source") ?? "";
  try {
    const result = await listCallLogs(auth.token, {
      ...parsePaging(params),
      ...(search ? { search } : {}),
      ...(risk ? { risk } : {}),
      ...(source ? { source } : {}),
    });
    return NextResponse.json(result);
  } catch (err) {
    return callCentreError("list", err);
  }
}

/** Log an alert. */
export async function POST(req: NextRequest) {
  const auth = await callCentreSession(req);
  if (auth instanceof NextResponse) return auth;
  const payload = await callLogFromBody(req, auth.token, { newLog: true, receivedBy: auth.agent });
  if (payload instanceof NextResponse) return payload;
  try {
    const patientId = await createCallLog(payload, { practitionerId: auth.profile.practitionerId }, auth.token);
    return NextResponse.json({ patientId }, { status: 201 });
  } catch (err) {
    return callCentreError("create", err);
  }
}
