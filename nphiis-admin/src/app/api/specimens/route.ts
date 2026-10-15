import { NextRequest, NextResponse } from "next/server";
import {
  forbidden,
  resolveUserRoles,
  unauthorized,
  verifyToken,
} from "@/lib/server-auth";
import { canAccess } from "@/lib/roles";
import { listSubmittedSpecimens } from "@/lib/fhir-specimens";

export async function GET(req: NextRequest) {
  const session = await verifyToken(req);
  if (!session) return unauthorized();
  const roles = await resolveUserRoles(session);
  if (!canAccess(roles, "SPECIMENS_VIEW")) {
    return forbidden("Specimen tracking access required");
  }

  try {
    const specimens = await listSubmittedSpecimens(session.raw);
    return NextResponse.json({ specimens });
  } catch (err) {
    console.error("[specimens] list failed:", (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
