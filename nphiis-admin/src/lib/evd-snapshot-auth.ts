import { NextRequest, NextResponse } from "next/server";
import { forbidden, resolveUserProfile, unauthorized, verifyToken, type UserProfile } from "./server-auth";
import { canAccess } from "./roles";
import { SnapshotError, snapshotScopeFor, type SnapshotScope } from "./fhir-evd-snapshot";
import { agentLabel } from "./call-centre";

export interface SnapshotSession {
  token: string;
  profile: UserProfile;
  /** null = whole country. */
  scope: SnapshotScope | null;
  submittedBy?: string;
}

/** The caller's session for the EVD snapshot routes, or the response that refuses it. */
export async function snapshotSession(req: NextRequest): Promise<SnapshotSession | NextResponse> {
  const session = await verifyToken(req);
  if (!session) return unauthorized();
  const profile = await resolveUserProfile(session);
  if (!canAccess(profile.roles, "EVD_SNAPSHOT")) return forbidden("EVD Daily Snapshot access required");
  const scope = snapshotScopeFor(profile);
  if (scope === undefined) return forbidden("Your profile has no county or sub-county, so no snapshots can be shown");
  const p = session.payload;
  const name = [p.given_name, p.family_name].filter(Boolean).join(" ") || undefined;
  return { token: session.raw, profile, scope, submittedBy: agentLabel(name, p.preferred_username) };
}

export function snapshotError(tag: string, err: unknown): NextResponse {
  if (err instanceof SnapshotError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error(`[evd-snapshot] ${tag} failed:`, (err as Error).message);
  return NextResponse.json({ error: (err as Error).message }, { status: 502 });
}
