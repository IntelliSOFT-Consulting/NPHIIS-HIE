// Adds the Reporting Site to VHF contacts the admin portal saved without one (uploads made
// before the portal filled it). The site is the uploader's, worked out the way hie-auth's
// /provider/me does it (PractitionerRole role and location, walked up Location.partOf).
//
//   npx tsx scripts/backfill-reporting-site.ts            # dry run: list what would change
//   npx tsx scripts/backfill-reporting-site.ts --apply    # write it
//
// FHIR_BASE_URL defaults to the local HAPI (http://localhost:8787/fhir). Safe to re-run:
// responses that already have the site are skipped.

import {
  FACILITY_TYPES,
  REPORTING_ROLES,
  reportingSiteBackfill,
  type Facility,
  type FacilityType,
  type ReportingSite,
  type SavedResponse,
} from "../src/lib/vhf-contacts";

const BASE = (process.env.FHIR_BASE_URL ?? "http://localhost:8787/fhir").replace(/\/$/, "");
const APPLY = process.argv.includes("--apply");

async function get<T>(path: string): Promise<T | undefined> {
  const res = await fetch(path.startsWith("http") ? path : `${BASE}/${path}`, { headers: { Accept: "application/fhir+json" } });
  if (res.status === 404 || res.status === 410) return undefined;
  if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

interface Bundle<T> {
  entry?: Array<{ resource: T }>;
  link?: Array<{ relation: string; url: string }>;
}

/** Every resource of a search; next links are re-pointed at BASE (HAPI answers with its public URL). */
async function searchAll<T>(query: string): Promise<T[]> {
  const out: T[] = [];
  let url: string | undefined = `${BASE}/${query}`;
  while (url) {
    const b: Bundle<T> | undefined = await get<Bundle<T>>(url);
    out.push(...(b?.entry ?? []).map((e) => e.resource));
    const next: string | undefined = b?.link?.find((l) => l.relation === "next")?.url;
    url = next ? `${BASE}?${new URL(next).search.slice(1)}` : undefined;
  }
  return out;
}

interface Location {
  id: string;
  name?: string;
  partOf?: { reference?: string };
  type?: Array<{ text?: string; coding?: Array<{ code?: string; display?: string }> }>;
  extension?: Array<{ valueString?: string; valueCoding?: { code?: string; display?: string }; valueCodeableConcept?: { text?: string } }>;
}

const LEVEL: Record<string, keyof ReportingSite> = {
  COUNTY: "county",
  "SUB-COUNTY": "subCounty",
  WARD: "ward",
  FACILITY: "facility",
};
const placeKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

function facilityType(loc: Location): FacilityType | undefined {
  const words = [
    ...(loc.type ?? []).flatMap((t) => [t.text, ...(t.coding ?? []).flatMap((c) => [c.code, c.display])]),
    ...(loc.extension ?? []).flatMap((e) => [e.valueString, e.valueCoding?.code, e.valueCoding?.display, e.valueCodeableConcept?.text]),
  ].map((w) => placeKey(w ?? ""));
  return FACILITY_TYPES.find((t) => words.includes(placeKey(t)));
}

/** The practitioner's reporting site, as the portal builds it from /provider/me. */
async function siteOf(practitionerId: string): Promise<ReportingSite> {
  const role = await get<{ code?: Array<{ coding?: Array<{ code?: string }> }>; location?: Array<{ reference?: string }> }>(
    `PractitionerRole/${practitionerId}`,
  );
  const practitioner = await get<{ extension?: Array<{ url?: string; valueString?: string; valueReference?: { reference?: string } }> }>(
    `Practitioner/${practitionerId}`,
  );
  const code =
    role?.code?.[0]?.coding?.[0]?.code ??
    practitioner?.extension?.find((e) => e.url?.endsWith("role-group"))?.valueString;
  const site: ReportingSite = { role: code && REPORTING_ROLES.includes(code) ? code : code || undefined };
  let ref =
    role?.location?.[0]?.reference ??
    practitioner?.extension?.find((e) => e.url === "http://example.org/location")?.valueReference?.reference;
  for (let depth = 0; ref && depth < 6; depth++) {
    const loc = await get<Location>(ref);
    if (!loc) break;
    const key = LEVEL[loc.type?.[0]?.coding?.[0]?.code ?? ""];
    if (key) {
      (site as Record<string, Facility>)[key] = { id: loc.id, name: loc.name || loc.id };
      if (key === "facility") site.facilityType = facilityType(loc);
    }
    ref = loc.partOf?.reference;
  }
  return site;
}

/** A case response the portal wrote (uuid v5 id) for a contact. */
function isPortalContact(qr: SavedResponse): boolean {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-5/.test(qr.id)) return false;
  return JSON.stringify(qr.item ?? []).includes('"linkId":"vhf-case-type"');
}

async function main() {
  const responses = (await searchAll<SavedResponse>("QuestionnaireResponse?_count=200")).filter(isPortalContact);
  const sites = new Map<string, ReportingSite>();
  let changed = 0;
  let failed = 0;
  for (const qr of responses) {
    const author = qr.author?.reference?.split("/")[1];
    if (author && !sites.has(author)) sites.set(author, await siteOf(author));
    const bundle = reportingSiteBackfill(qr, author ? sites.get(author) : undefined);
    if (!bundle) continue;
    changed++;
    const added = bundle.entry.length - 1;
    if (!APPLY) {
      console.log(`would update QuestionnaireResponse/${qr.id} (+${added} answers)`);
      continue;
    }
    const res = await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/fhir+json", Accept: "application/fhir+json" },
      body: JSON.stringify(bundle),
    });
    if (res.ok) console.log(`updated QuestionnaireResponse/${qr.id} (+${added} answers)`);
    else {
      failed++;
      console.error(`FAILED QuestionnaireResponse/${qr.id}: ${res.status} ${(await res.text()).slice(0, 300)}`);
    }
  }
  sites.forEach((s, id) => console.log(`site of Practitioner/${id}:`, JSON.stringify(s)));
  console.log(`${responses.length} portal contacts, ${changed} ${APPLY ? "updated" : "to update"}${failed ? `, ${failed} failed` : ""}`);
  if (!APPLY && changed) console.log("Dry run. Re-run with --apply to write.");
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
