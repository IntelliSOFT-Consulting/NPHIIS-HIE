import { NextRequest, NextResponse } from "next/server";
import { contactsError, contactsSession } from "@/lib/contacts-auth";
import { buildBoard, refreshCaseList } from "@/lib/fhir-contacts";

/** Rebuilds a case's contact list, optionally taking contacts off it or putting them back: body { remove?: string[], restore?: string[] }. */
export async function POST(req: NextRequest, context: { params: Promise<{ indexEncounterId: string }> }) {
  const s = await contactsSession(req);
  if (s instanceof NextResponse) return s;
  const { indexEncounterId } = await context.params;
  const body = (await req.json().catch(() => ({}))) as { remove?: unknown; restore?: unknown };
  const ids = (v: unknown) => (Array.isArray(v) ? v.map(String).slice(0, 1000) : undefined);
  try {
    const list = await refreshCaseList(s.token, indexEncounterId, { remove: ids(body.remove), restore: ids(body.restore) });
    return NextResponse.json(await buildBoard(list, s.token, s.scope));
  } catch (err) {
    return contactsError("list", err);
  }
}
