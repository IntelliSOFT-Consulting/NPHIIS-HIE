import { NotificationType } from "@prisma/client";
import { prisma } from "./prisma";
import { FhirApi } from "./utils";
import { fcmService } from "./fcm";
import { getKeycloakUserById, isNotificationsEnabledForKeycloakUser } from "./keycloak";
import { getRoleFromPractitionerRoleResource } from "./practitioner-role";
import {
  COUNTY_CODE,
  LOCATION_TYPE_SYSTEM,
  SUB_COUNTY_CODE,
  locationHasType,
  resolveSubCountyLocationByName,
} from "./epid-location";
import { ensureVhfContactId, promoteConvertedVhfContact } from "./epid-assignment";
import { findCaseEncounter, linkedCaseValues, upsertContactList, type ContactListResult } from "./vhf-contact-list";
import { kenyaToday } from "./vhf-contact-status";

/**
 * Daily VHF contact job: rebuilds every case's contact List (so contacts registered on mobile
 * join it), promotes contacts that were converted to cases, and queues reminders: the
 * sub-county surveillance officer for each contact due today, the county officer for each day
 * missed yesterday. No HAPI subscription is involved (createFHIRSubscription deletes and
 * recreates every subscription at start-up).
 */

export const SUB_COUNTY_OFFICER_ROLE = "SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER";
export const COUNTY_OFFICER_ROLE = "COUNTY_DISEASE_SURVEILLANCE_OFFICER";
const VHF_TYPES = [NotificationType.VHF_CONTACT_FOLLOW_UP, NotificationType.VHF_CONTACT_MISSED];

type Contact = ContactListResult["contacts"][number];

/** The contact's Contact ID, assigning it when its case has an EPID; null while it cannot be. */
export async function contactIdOrNull(encounterId: string): Promise<string | null> {
  const r = await ensureVhfContactId(encounterId);
  if (r.kind === "assigned" || r.kind === "present") return r.contactId;
  if (r.kind === "error") console.warn(`[VhfContacts] Contact ID for Encounter/${encounterId}:`, r.error);
  return null;
}

export type Reminder = {
  type: NotificationType;
  encounterId: string;
  followUpDay: number;
  area: "sub-county" | "county";
  subCounty: string;
  title: string;
  body: string;
};

/** The reminders a contact needs today (pure; recipients are resolved separately). */
export function remindersFor(contact: Contact, caseLabel: string): Reminder[] {
  const who = contact.contactId ?? contact.epid ?? `contact ${contact.encounterId.slice(0, 8)}`;
  const out: Reminder[] = [];
  if (!contact.subCounty) return out;
  if (contact.dueToday) {
    out.push({
      type: NotificationType.VHF_CONTACT_FOLLOW_UP,
      encounterId: contact.encounterId,
      followUpDay: contact.daysSinceExposure,
      area: "sub-county",
      subCounty: contact.subCounty,
      title: `VHF contact follow up due: day ${contact.daysSinceExposure}/21`,
      body: `${who}, contact of ${caseLabel}, is due for day ${contact.daysSinceExposure} follow up today.`,
    });
  }
  const yesterday = contact.daysSinceExposure - 1;
  if (contact.missedDays.includes(yesterday) && (contact.status === "active" || contact.status === "lost")) {
    out.push({
      type: NotificationType.VHF_CONTACT_MISSED,
      encounterId: contact.encounterId,
      followUpDay: yesterday,
      area: "county",
      subCounty: contact.subCounty,
      title: `VHF contact follow up missed: day ${yesterday}`,
      body: `${who}, contact of ${caseLabel}, was not followed up on day ${yesterday} (${contact.missedDays.length} day(s) missed in all).`,
    });
  }
  return out;
}

/** Practitioner ids holding [role] at [locationId] (PractitionerRole.location). */
async function officersAt(locationId: string, role: string): Promise<string[]> {
  const bundle = (await FhirApi({ url: `/PractitionerRole?location=Location/${encodeURIComponent(locationId)}&_count=100` })).data;
  const ids = (bundle?.entry ?? [])
    .map((e: any) => e.resource)
    .filter((r: any) => r?.resourceType === "PractitionerRole" && r.active !== false)
    .filter((r: any) => (getRoleFromPractitionerRoleResource(r) ?? "").toUpperCase() === role)
    .map((r: any) => r.practitioner?.reference?.split("/")[1] ?? r.id)
    .filter(Boolean);
  return [...new Set<string>(ids)];
}

/** The country (Location/0) is never an area: officers assigned there are not reminded. */
const COUNTRY_ID = "0";

/**
 * The sub-county and county a contact's residence answer names. A county given in the
 * sub-county question ("NAIROBI") counts as that county; anything else (a ward, a facility,
 * the country) names no area.
 */
export function reminderAreas(place: any, parent: any): { subCountyId?: string; countyId?: string } {
  const id = (l: any) => (l?.id && l.id !== COUNTRY_ID ? String(l.id) : undefined);
  if (locationHasType(place, SUB_COUNTY_CODE)) {
    return { subCountyId: id(place), countyId: locationHasType(parent, COUNTY_CODE) ? id(parent) : undefined };
  }
  if (locationHasType(place, COUNTY_CODE)) return { countyId: id(place) };
  return {};
}

/** The sub-county, else the county, with this name (case ignored). */
async function placeNamed(name: string): Promise<any | null> {
  const sub = await resolveSubCountyLocationByName(FhirApi as any, name);
  if (locationHasType(sub, SUB_COUNTY_CODE)) return sub;
  const type = encodeURIComponent(`${LOCATION_TYPE_SYSTEM}|${COUNTY_CODE}`);
  const bundle = (await FhirApi({ url: `/Location?name=${encodeURIComponent(name.trim())}&type=${type}&_count=20` })).data;
  const counties = (bundle?.entry ?? []).map((e: any) => e.resource);
  return counties.find((l: any) => String(l?.name ?? "").trim().toUpperCase() === name.trim().toUpperCase()) ?? null;
}

const officerCache = new Map<string, Promise<string[]>>();

/**
 * The surveillance officers to remind about a contact living in [placeName]: the sub-county
 * officers for a due day (the county officers when only the county is known), the county
 * officers for a missed day.
 */
export function officersFor(placeName: string, area: Reminder["area"]): Promise<string[]> {
  const key = `${area}|${placeName.trim().toUpperCase()}`;
  if (!officerCache.has(key)) {
    officerCache.set(
      key,
      (async () => {
        const place = await placeNamed(placeName);
        if (!place) return [];
        const parentId = place.partOf?.reference?.split("/")[1];
        const parent = parentId && parentId !== COUNTRY_ID ? (await FhirApi({ url: `/Location/${parentId}` })).data : null;
        const { subCountyId, countyId } = reminderAreas(place, parent);
        if (area === "sub-county" && subCountyId) return officersAt(subCountyId, SUB_COUNTY_OFFICER_ROLE);
        return countyId ? officersAt(countyId, COUNTY_OFFICER_ROLE) : [];
      })().catch((e) => {
        officerCache.delete(key);
        throw e;
      }),
    );
  }
  return officerCache.get(key)!;
}

/** Queues a reminder once per recipient and day (the unique key makes reruns harmless). */
async function queue(reminder: Reminder, practitionerId: string, today: string): Promise<void> {
  const where = {
    practitionerId_encounterId_type_followUpDay: {
      practitionerId,
      encounterId: reminder.encounterId,
      type: reminder.type,
      followUpDay: reminder.followUpDay,
    },
  };
  await prisma.notification.upsert({
    where,
    update: {},
    create: {
      practitionerId,
      encounterId: reminder.encounterId,
      type: reminder.type,
      followUpDay: reminder.followUpDay,
      dueDate: new Date(`${today}T00:00:00+03:00`),
      title: reminder.title,
      body: reminder.body,
    },
  });
}

export type DailyJobSummary = { cases: number; contacts: number; promoted: number; queued: number; errors: number };

export async function runVhfContactDailyJob(today: string = kenyaToday()): Promise<DailyJobSummary> {
  officerCache.clear();
  const summary: DailyJobSummary = { cases: 0, contacts: 0, promoted: 0, queued: 0, errors: 0 };
  const indexIds = new Set<string>();
  for (const value of await linkedCaseValues()) {
    try {
      const index = await findCaseEncounter(value);
      if (index?.id) indexIds.add(index.id);
      else console.warn(`[VhfContacts] No VHF case with EPID/Case ID ${value}; its contacts are unlinked`);
    } catch (e) {
      summary.errors++;
      console.error(`[VhfContacts] Looking up case ${value} failed:`, e);
    }
  }

  for (const indexId of indexIds) {
    try {
      const result = await upsertContactList(indexId, { today, ensureContactId: contactIdOrNull });
      summary.cases++;
      summary.contacts += result.contacts.length;
      const caseLabel = result.list?.identifier?.[0]?.value ?? `Encounter/${indexId}`;
      for (const contact of result.contacts) {
        if (contact.status === "converted") {
          const promoted = await promoteConvertedVhfContact(contact.encounterId);
          if (promoted.kind === "promoted") summary.promoted++;
          continue;
        }
        for (const reminder of remindersFor(contact, caseLabel)) {
          for (const practitionerId of await officersFor(reminder.subCounty, reminder.area)) {
            await queue(reminder, practitionerId, today);
            summary.queued++;
          }
        }
      }
    } catch (e) {
      summary.errors++;
      console.error(`[VhfContacts] Contact list of Encounter/${indexId} failed:`, e);
    }
  }
  console.log(`[VhfContacts] Daily job ${today}: ${JSON.stringify(summary)}`);
  return summary;
}

/**
 * Sends today's queued VHF contact reminders by FCM; a failed one is retried the next day.
 * Older pending ones are not sent: a reminder for a past day is no use.
 */
export async function sendVhfContactReminders(today: string = kenyaToday()): Promise<{ sent: number; failed: number }> {
  const todayStart = new Date(`${today}T00:00:00+03:00`);
  const yesterday = new Date(todayStart.getTime() - 86_400_000);
  const rows = await prisma.notification.findMany({
    where: {
      type: { in: VHF_TYPES },
      OR: [
        { status: "PENDING", dueDate: todayStart },
        { status: "FAILED", dueDate: { gte: yesterday, lte: todayStart } },
      ],
    },
  });
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const keycloakUser = await getKeycloakUserById(row.practitionerId);
      if (!isNotificationsEnabledForKeycloakUser(keycloakUser)) continue;
      const recipient = await prisma.notificationRecipient.findFirst({ where: { practitionerId: row.practitionerId } });
      if (!recipient?.token) {
        await prisma.notification.update({ where: { id: row.id }, data: { status: "FAILED", failureReason: "No FCM token" } });
        failed++;
        continue;
      }
      const response = await fcmService.sendToDevice(recipient.token, { title: row.title, body: row.body });
      const ok = Boolean(response?.success);
      await prisma.notification.update({
        where: { id: row.id },
        data: ok ? { status: "SENT", failureReason: null } : { status: "FAILED", failureReason: response?.error ?? "FCM delivery failed" },
      });
      ok ? sent++ : failed++;
    } catch (e) {
      failed++;
      console.error(`[VhfContacts] Reminder ${row.id} failed:`, e);
    }
  }
  console.log(`[VhfContacts] Reminders sent=${sent} failed=${failed}`);
  return { sent, failed };
}
