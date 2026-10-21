import { NextRequest, NextResponse } from "next/server";
import { forbidden, resolveUserProfile, unauthorized, verifyToken, type UserProfile } from "./server-auth";
import { canAccess } from "./roles";
import { type CallLogPayload, agentLabel, validateCallLog } from "./call-centre";
import { CallLogNotFoundError, LinkedCaseError, verifyLinkedCase } from "./fhir-call-centre";

export interface CallCentreSession {
  token: string;
  profile: UserProfile;
  /** Agent ID for new logs, from the login token. */
  agent?: string;
}

/** The caller's session for the Call Centre routes, or the response that refuses it. National: no area limit. */
export async function callCentreSession(req: NextRequest): Promise<CallCentreSession | NextResponse> {
  const session = await verifyToken(req);
  if (!session) return unauthorized();
  const profile = await resolveUserProfile(session);
  if (!canAccess(profile.roles, "CALL_CENTRE")) return forbidden("Call Centre access required");
  const p = session.payload;
  const name = [p.given_name, p.family_name].filter(Boolean).join(" ") || undefined;
  return { token: session.raw, profile, agent: agentLabel(name, p.preferred_username) };
}

/**
 * A valid call log from the request body, or the 400 response explaining what is wrong.
 * A linked case is checked against HAPI (it must exist and carry that EPID).
 */
export async function callLogFromBody(req: NextRequest, token: string): Promise<CallLogPayload | NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { answers, locations, linkedCase } = (body ?? {}) as Partial<CallLogPayload>;
  const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  if (!isRecord(answers) || !isRecord(locations ?? {})) {
    return NextResponse.json({ error: "Body must have answers and locations" }, { status: 400 });
  }
  const payload: CallLogPayload = { answers: {}, locations: {} };
  for (const [k, v] of Object.entries(answers)) {
    if (typeof v === "string" || typeof v === "number") payload.answers[k] = String(v);
  }
  for (const [k, v] of Object.entries(locations ?? {})) {
    const loc = v as { id?: unknown; name?: unknown };
    if (typeof loc?.id === "string" && typeof loc?.name === "string") payload.locations[k] = { id: loc.id, name: loc.name };
  }
  const errors = validateCallLog(payload);
  if (Object.keys(errors).length) {
    return NextResponse.json({ error: "Some answers need attention", errors }, { status: 400 });
  }
  if (linkedCase) {
    const { patientId, epid } = linkedCase as { patientId?: unknown; epid?: unknown };
    if (typeof patientId !== "string" || typeof epid !== "string") {
      return NextResponse.json({ error: "linkedCase needs patientId and epid" }, { status: 400 });
    }
    try {
      payload.linkedCase = await verifyLinkedCase({ patientId, epid }, token);
    } catch (err) {
      if (err instanceof LinkedCaseError) return NextResponse.json({ error: err.message }, { status: 400 });
      return callCentreError("linked case check", err);
    }
  }
  return payload;
}

export function callCentreError(tag: string, err: unknown): NextResponse {
  if (err instanceof CallLogNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
  console.error(`[call-centre] ${tag} failed:`, (err as Error).message);
  return NextResponse.json({ error: (err as Error).message }, { status: 502 });
}
