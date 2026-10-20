import { NextRequest, NextResponse } from "next/server";
import { contactsError, contactsSession } from "@/lib/contacts-auth";
import { buildBoard, caseListById } from "@/lib/fhir-contacts";

/** A case's contacts with their 21-day follow up: GET /api/contacts?id=<EPID or Case ID> */
export async function GET(req: NextRequest) {
  const s = await contactsSession(req);
  if (s instanceof NextResponse) return s;
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "Enter the case's EPID or Case ID" }, { status: 400 });
  try {
    const list = await caseListById(s.token, id);
    return NextResponse.json(await buildBoard(list, s.token, s.scope));
  } catch (err) {
    return contactsError("board", err);
  }
}
