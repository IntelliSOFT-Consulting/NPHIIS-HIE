import { NextRequest, NextResponse } from "next/server";
import { callCentreError, callCentreSession } from "@/lib/call-centre-auth";
import { parseCaseQuery } from "@/lib/case-search";
import { searchCases } from "@/lib/fhir-call-centre";

/** Cases with an EPID to link a call log to: GET /api/call-centre/cases?q=<EPID, phone or name> */
export async function GET(req: NextRequest) {
  const auth = await callCentreSession(req);
  if (auth instanceof NextResponse) return auth;
  const query = parseCaseQuery(req.nextUrl.searchParams.get("q") ?? "");
  if (query.kind === "empty" || query.kind === "partial-phone") {
    return NextResponse.json({ error: "Enter an EPID, a phone number, or at least two letters of a name" }, { status: 400 });
  }
  try {
    return NextResponse.json({ cases: await searchCases(query, auth.token) });
  } catch (err) {
    return callCentreError("case search", err);
  }
}
