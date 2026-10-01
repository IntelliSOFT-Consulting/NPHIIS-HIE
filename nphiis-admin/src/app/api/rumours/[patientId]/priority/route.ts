import { NextRequest, NextResponse } from "next/server";
import {
  forbidden,
  resolveUserProfile,
  unauthorized,
  verifyToken,
} from "@/lib/server-auth";
import { canAccess } from "@/lib/roles";
import { isRumourPriority, RUMOUR_PRIORITIES } from "@/lib/rumours";
import {
  RumourNotFoundError,
  rumourScopeFor,
  setRumourPriority,
} from "@/lib/fhir-rumours";

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ patientId: string }> },
) {
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

  let priority: unknown;
  try {
    ({ priority } = (await req.json()) as { priority?: unknown });
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!isRumourPriority(priority)) {
    return NextResponse.json(
      { error: `Priority must be one of ${RUMOUR_PRIORITIES.join(", ")}` },
      { status: 400 },
    );
  }

  const { patientId } = await context.params;
  try {
    await setRumourPriority({
      patientId,
      priority,
      scope,
      practitionerId: profile.practitionerId,
      token: session.raw,
    });
    return NextResponse.json({ patientId, priority });
  } catch (err) {
    if (err instanceof RumourNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    console.error("[rumours] set priority failed:", patientId, (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
