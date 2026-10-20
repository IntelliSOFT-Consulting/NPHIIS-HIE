import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { contactsError, contactsSession } from "@/lib/contacts-auth";
import { contactRecord, postTransaction, refreshCaseList } from "@/lib/fhir-contacts";
import { buildFollowUpBundle, FOLLOW_UP_WINDOW_DAYS } from "@/lib/vhf-contacts";

const FollowUp = z.object({
  indexEncounterId: z.string().min(1),
  day: z.number().int().min(0).max(FOLLOW_UP_WINDOW_DAYS),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  symptomatic: z.boolean(),
  symptoms: z.array(z.string()).optional(),
  temperatureAm: z.number().min(30).max(45).optional(),
  temperaturePm: z.number().min(30).max(45).optional(),
  approach: z.enum(["physical-visit", "phone-call"]).optional(),
  challenges: z.array(z.string()).optional(),
});

/** Records one day's follow up of a contact, then refreshes its case's list. */
export async function POST(req: NextRequest, context: { params: Promise<{ encounterId: string }> }) {
  const s = await contactsSession(req);
  if (s instanceof NextResponse) return s;
  const { encounterId } = await context.params;
  const parsed = FollowUp.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid follow up" }, { status: 400 });
  const { indexEncounterId, ...followUp } = parsed.data;
  if (followUp.date > new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10)) {
    return NextResponse.json({ error: "The follow-up date cannot be in the future" }, { status: 400 });
  }
  try {
    const contact = await contactRecord(encounterId, s.token);
    if (!contact) return NextResponse.json({ error: "Contact record not found" }, { status: 404 });
    const facility = s.profile.locationInfo?.facility
      ? { id: s.profile.locationInfo.facility, name: s.profile.locationInfo.facilityName ?? s.profile.locationInfo.facility }
      : undefined;
    await postTransaction(
      buildFollowUpBundle({ patientId: contact.patientId, contactEncounterId: contact.encounterId }, followUp, {
        practitionerId: s.profile.practitionerId,
        facility,
      }),
      s.token,
    );
    await refreshCaseList(s.token, indexEncounterId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return contactsError("follow-up", err);
  }
}
