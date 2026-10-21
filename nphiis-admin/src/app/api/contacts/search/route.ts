import { NextRequest, NextResponse } from "next/server";
import { contactsError, contactsSession } from "@/lib/contacts-auth";
import { parseCaseQuery } from "@/lib/case-search";
import { searchIndexCases } from "@/lib/fhir-contacts";

/** VHF cases whose person matches a name or phone number: GET /api/contacts/search?q=<name or phone> */
export async function GET(req: NextRequest) {
  const s = await contactsSession(req);
  if (s instanceof NextResponse) return s;
  const query = parseCaseQuery(req.nextUrl.searchParams.get("q") ?? "");
  if (query.kind === "empty" || query.kind === "partial-phone") return NextResponse.json({ error: "Enter at least two letters of a name, or a phone number" }, { status: 400 });
  if (query.kind === "id") return NextResponse.json({ error: "Open an EPID or Case ID with /api/contacts?id=" }, { status: 400 });
  try {
    return NextResponse.json({ cases: await searchIndexCases(query, s.token) });
  } catch (err) {
    return contactsError("search", err);
  }
}
