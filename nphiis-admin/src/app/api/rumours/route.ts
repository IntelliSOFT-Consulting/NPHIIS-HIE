import { NextRequest, NextResponse } from "next/server";
import {
  forbidden,
  resolveUserProfile,
  unauthorized,
  verifyToken,
} from "@/lib/server-auth";
import { canAccess } from "@/lib/roles";
import { listRumours, rumourScopeFor } from "@/lib/fhir-rumours";
import { parsePaging } from "@/lib/pagination";
import { isRumourPriority } from "@/lib/rumours";

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

  const params = req.nextUrl.searchParams;
  const priority = params.get("priority") ?? "";
  const search = (params.get("q") ?? "").trim();
  try {
    const result = await listRumours(session.raw, scope, {
      ...parsePaging(params),
      ...(search ? { search } : {}),
      ...(isRumourPriority(priority) || priority === "unset" ? { priority } : {}),
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[rumours] list failed:", (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
