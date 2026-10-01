import { NextRequest, NextResponse } from "next/server";
import {
  forbidden,
  resolveUserProfile,
  unauthorized,
  verifyToken,
} from "@/lib/server-auth";
import { canAccess } from "@/lib/roles";
import { listRumours, rumourScopeFor } from "@/lib/fhir-rumours";

export async function GET(req: NextRequest) {
  const session = await verifyToken(req);
  if (!session) return unauthorized();
  const profile = await resolveUserProfile(session);
  if (!canAccess(profile.roles, "RUMOURS_TRIAGE")) {
    return forbidden("Rumour triage access required");
  }
  const scope = rumourScopeFor(profile);
  if (scope === undefined) {
    return forbidden("Your account has no county or sub-county assigned");
  }

  try {
    const rumours = await listRumours(session.raw, scope);
    return NextResponse.json({ rumours });
  } catch (err) {
    console.error("[rumours] list failed:", (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
