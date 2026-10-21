/**
 * Where a screened person's case is registered when its case form gave no sub-county:
 * the screening's point of entry, else the facility that reported the screening.
 * A point of entry sits under its sub-county, or under the (port health) facility it is
 * mapped to; either way its partOf chain reaches a SUB-COUNTY Location.
 */
import { locationHasType, SUB_COUNTY_CODE } from "./epid-location";
import { REPORTING_LINK_IDS, SCREENING_LINK_IDS, SCREENING_TAG_CODE, SCREENING_TAG_SYSTEM } from "./screening";

type FhirApiLike = (params: { url: string }) => Promise<{ data?: any }>;

/** Facility -> ward -> sub-county -> county: a few hops at most. */
const MAX_HOPS = 6;
const POE_LOCATION_LINK_ID = `${SCREENING_LINK_IDS.pointOfEntry}.location`;

const locationId = (ref: unknown): string | undefined => {
  const m = typeof ref === "string" ? /^Location\/([^/]+)$/.exec(ref.trim()) : null;
  return m?.[1];
};

/** The first SUB-COUNTY at or above this Location; undefined when the chain never reaches one. */
export async function subCountyAbove(fhirApi: FhirApiLike, id: string): Promise<any | undefined> {
  const seen = new Set<string>();
  let next: string | undefined = id;
  for (let hop = 0; next && hop <= MAX_HOPS && !seen.has(next); hop++) {
    seen.add(next);
    const location = (await fhirApi({ url: `/Location/${encodeURIComponent(next)}` })).data;
    if (location?.resourceType !== "Location") return undefined;
    if (locationHasType(location, SUB_COUNTY_CODE)) return location;
    next = locationId(location.partOf?.reference);
  }
  return undefined;
}

function findItem(items: any[] | undefined, linkId: string): any | undefined {
  for (const item of items ?? []) {
    if (item?.linkId === linkId) return item;
    const nested = findItem(item?.item, linkId);
    if (nested) return nested;
  }
  return undefined;
}

/** Locations to try for one screening response, best first: point of entry, then reporting facility, ward, sub-county. */
export function screeningLocationCandidates(qr: any): string[] {
  const ref = (linkId: string) => locationId(findItem(qr?.item, linkId)?.answer?.[0]?.valueReference?.reference);
  const reporting = findItem(qr?.item, REPORTING_LINK_IDS.group)?.item;
  // The reporting site fills one level group, so its linkIds carry a level suffix (e.g. _national).
  const reportingRef = (base: string) => {
    for (const group of reporting ?? []) {
      for (const item of group?.item ?? []) {
        if (typeof item?.linkId === "string" && (item.linkId === base || item.linkId.startsWith(`${base}_`))) {
          const id = locationId(item.answer?.[0]?.valueReference?.reference);
          if (id) return id;
        }
      }
    }
    return undefined;
  };
  const ids = [
    ref(POE_LOCATION_LINK_ID),
    reportingRef(REPORTING_LINK_IDS.facility),
    reportingRef(REPORTING_LINK_IDS.ward),
    reportingRef(REPORTING_LINK_IDS.subCounty),
  ];
  return [...new Set(ids.filter((id): id is string => !!id))];
}

/** Sub-county from the patient's screenings, newest first; undefined when none can be placed. */
export async function screeningSubCountyForPatient(
  fhirApi: FhirApiLike,
  patientId: string,
): Promise<any | undefined> {
  const tag = encodeURIComponent(`${SCREENING_TAG_SYSTEM}|${SCREENING_TAG_CODE}`);
  const bundle = (
    await fhirApi({
      url: `/QuestionnaireResponse?subject=${encodeURIComponent(`Patient/${patientId}`)}&_tag=${tag}&_sort=-authored&_count=10`,
    })
  ).data;
  for (const entry of bundle?.entry ?? []) {
    for (const id of screeningLocationCandidates(entry?.resource)) {
      const subCounty = await subCountyAbove(fhirApi, id);
      if (subCounty) return subCounty;
    }
  }
  return undefined;
}
