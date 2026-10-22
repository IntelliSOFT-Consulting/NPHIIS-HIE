import { NextRequest, NextResponse } from "next/server";
import { forbidden, resolveUserRoles, unauthorized, verifyToken } from "@/lib/server-auth";
import { canAccess } from "@/lib/roles";
import { listSubmittedSpecimens } from "@/lib/fhir-specimens";

const DONE = new Set(["final-result", "specimen-rejected"]);

// Specimens still waiting for a final result or a rejection, to pre-fill the
// specimen results CSV template.
export async function GET(req: NextRequest) {
  const session = await verifyToken(req);
  if (!session) return unauthorized();
  const roles = await resolveUserRoles(session);
  if (!canAccess(roles, "LAB_ACCESS")) return forbidden("Lab access required");
  try {
    const specimens = (await listSubmittedSpecimens(session.raw)).filter((s) => !s.status || !DONE.has(s.status));
    return NextResponse.json({ specimens });
  } catch (err) {
    console.error("[lab/open-specimens] failed:", (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
