import { NextRequest, NextResponse } from "next/server";
import { contactsError, contactsSession } from "@/lib/contacts-auth";
import { buildBoard, refreshCaseList } from "@/lib/fhir-contacts";

/** Rebuilds a case's contact list, optionally taking contacts off it: body { remove?: string[] }. */
export async function POST(req: NextRequest, context: { params: Promise<{ indexEncounterId: string }> }) {
  const s = await contactsSession(req);
  if (s instanceof NextResponse) return s;
  const { indexEncounterId } = await context.params;
  const body = (await req.json().catch(() => ({}))) as { remove?: unknown };
  const remove = Array.isArray(body.remove) ? body.remove.map(String) : undefined;
  try {
    const list = await refreshCaseList(s.token, indexEncounterId, remove);
    return NextResponse.json(await buildBoard(list, s.token, s.scope));
  } catch (err) {
    return contactsError("list", err);
  }
}
