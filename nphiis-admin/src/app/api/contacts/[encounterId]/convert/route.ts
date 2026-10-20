import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { contactsError, contactsSession } from "@/lib/contacts-auth";
import { contactConverted, contactRecord, postTransaction } from "@/lib/fhir-contacts";
import { buildConversionBundle } from "@/lib/vhf-contacts";

const Convert = z.object({
  indexEncounterId: z.string().min(1),
  caseType: z.enum(["suspected", "probable", "confirmed"]).default("suspected"),
});

/**
 * Converts a contact to a case: a new "Type of case" answer (the old one is kept), then
 * hie-auth assigns its Case ID, sends it to NPHL, alerts and refreshes the source case's list.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ encounterId: string }> }) {
  const s = await contactsSession(req);
  if (s instanceof NextResponse) return s;
  const { encounterId } = await context.params;
  const parsed = Convert.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "indexEncounterId is required" }, { status: 400 });
  try {
    const contact = await contactRecord(encounterId, s.token);
    if (!contact) return NextResponse.json({ error: "Contact record not found" }, { status: 404 });
    await postTransaction(
      buildConversionBundle({ patientId: contact.patientId, contactEncounterId: contact.encounterId }, parsed.data.caseType, {
        practitionerId: s.profile.practitionerId,
      }),
      s.token,
    );
    const result = await contactConverted(s.token, encounterId, parsed.data.indexEncounterId);
    return NextResponse.json({ ok: true, promoted: result.promoted });
  } catch (err) {
    return contactsError("convert", err);
  }
}
