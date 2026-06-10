import { NextRequest, NextResponse } from "next/server";
import {
  forbidden,
  resolveUserRoles,
  unauthorized,
  verifyToken,
} from "@/lib/server-auth";
import { canAccess } from "@/lib/roles";
import { searchCases } from "@/lib/fhir-patient";

interface RequestBody {
  name?: string;
  county?: string;
  subCounty?: string;
  epid?: string;
}

// Broader case search for the lab module: look up cases by patient name,
// county, sub-county or (partial) EPID and return a selectable list. The
// caller then picks one and the existing /api/lab/verify-epid flow loads it.
export async function POST(req: NextRequest) {
  const session = await verifyToken(req);
  if (!session) return unauthorized();
  const roles = await resolveUserRoles(session);
  if (!canAccess(roles, "LAB_ACCESS")) {
    return forbidden("Lab access required");
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, county, subCounty, epid } = body;
  if (![name, county, subCounty, epid].some((v) => (v ?? "").trim())) {
    return NextResponse.json(
      { error: "Enter at least one search term (name, county, sub-county or EPID)" },
      { status: 400 },
    );
  }

  try {
    const results = await searchCases(
      { name, county, subCounty, epid },
      session.raw,
    );
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
