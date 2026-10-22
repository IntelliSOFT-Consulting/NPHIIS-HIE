import { NextRequest, NextResponse } from "next/server";
import { forbidden, resolveUserRoles, unauthorized, verifyToken } from "@/lib/server-auth";
import { canAccess } from "@/lib/roles";
import { listCaseSpecimens } from "@/lib/fhir-specimens";

// A case's specimens with their lab status, for entering results against them.
export async function GET(req: NextRequest) {
  const session = await verifyToken(req);
  if (!session) return unauthorized();
  const roles = await resolveUserRoles(session);
  if (!canAccess(roles, "LAB_ACCESS")) return forbidden("Lab access required");

  const patientId = req.nextUrl.searchParams.get("patientId")?.trim() ?? "";
  if (!/^[A-Za-z0-9\-.]{1,64}$/.test(patientId)) {
    return NextResponse.json({ error: "patientId is required" }, { status: 400 });
  }
  try {
    return NextResponse.json({ specimens: await listCaseSpecimens(patientId, session.raw) });
  } catch (err) {
    console.error("[lab/case-specimens] failed:", (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
