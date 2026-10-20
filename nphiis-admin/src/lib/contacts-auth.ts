import { NextRequest, NextResponse } from "next/server";
import { forbidden, resolveUserProfile, unauthorized, verifyToken, type UserProfile } from "./server-auth";
import { canAccess } from "./roles";
import { rumourScopeFor, type RumourScope } from "./fhir-rumours";
import { HieAuthError } from "./fhir-contacts";

export interface ContactsSession {
  token: string;
  profile: UserProfile;
  /** null: national (every area); otherwise the viewer's county or sub-county. */
  scope: RumourScope | null;
}

/** The caller's session for the contact-tracing routes, or the response that refuses it. */
export async function contactsSession(req: NextRequest): Promise<ContactsSession | NextResponse> {
  const session = await verifyToken(req);
  if (!session) return unauthorized();
  const profile = await resolveUserProfile(session);
  if (!canAccess(profile.roles, "VHF_CONTACTS")) return forbidden("VHF contact tracing access required");
  const scope = rumourScopeFor(profile);
  if (scope === undefined) return forbidden("Your account has no county or sub-county assigned");
  return { token: session.raw, profile, scope };
}

export function contactsError(tag: string, err: unknown): NextResponse {
  const status = err instanceof HieAuthError ? err.status : 502;
  console.error(`[contacts] ${tag} failed:`, (err as Error).message);
  return NextResponse.json({ error: (err as Error).message }, { status });
}
