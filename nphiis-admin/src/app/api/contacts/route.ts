import { NextRequest, NextResponse } from "next/server";
import { contactsError, contactsSession } from "@/lib/contacts-auth";
import { buildBoard, caseListById, refreshCaseList } from "@/lib/fhir-contacts";

/**
 * A case's contacts with their 21-day follow up:
 *   GET /api/contacts?id=<EPID or Case ID>
 *   GET /api/contacts?encounter=<case Encounter id> (a search result, which may have neither yet)
 */
export async function GET(req: NextRequest) {
  const s = await contactsSession(req);
  if (s instanceof NextResponse) return s;
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  const encounter = (req.nextUrl.searchParams.get("encounter") ?? "").trim();
  if (!id && !encounter) return NextResponse.json({ error: "Enter the case's EPID or Case ID" }, { status: 400 });
  try {
    const list = encounter ? await refreshCaseList(s.token, encounter) : await caseListById(s.token, id);
    return NextResponse.json(await buildBoard(list, s.token, s.scope));
  } catch (err) {
    return contactsError("board", err);
  }
}
