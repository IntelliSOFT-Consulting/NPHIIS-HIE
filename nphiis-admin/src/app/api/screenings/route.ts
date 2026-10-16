import { NextRequest, NextResponse } from "next/server";
import {
  forbidden,
  resolveUserRoles,
  unauthorized,
  verifyToken,
} from "@/lib/server-auth";
import { canAccess } from "@/lib/roles";
import { listScreenedPeople } from "@/lib/fhir-screenings";

export async function GET(req: NextRequest) {
  const session = await verifyToken(req);
  if (!session) return unauthorized();
  const roles = await resolveUserRoles(session);
  if (!canAccess(roles, "SCREENINGS_VIEW")) {
    return forbidden("Screening access required");
  }

  try {
    const people = await listScreenedPeople(session.raw);
    return NextResponse.json({ people });
  } catch (err) {
    console.error("[screenings] list failed:", (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
