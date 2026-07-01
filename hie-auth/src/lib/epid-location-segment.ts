/**
 * EPID location segment rules (country / county / sub-county prefixes in EPID).
 */

import { resolveSubCountyLocationByName } from "./epid-location";

/** Legacy rule: first 3 characters of the full name (pre multi-word fix). */
export function legacyLocationSegment(name: string): string {
  return name.toUpperCase().trim().substring(0, 3);
}

/**
 * EPID location segment at a given length:
 * - Single-word names: first N letters (e.g. "KISUMU", 3 -> "KIS")
 * - Multi-word names: first 2 letters of first word + first letter of last word,
 *   then extend through first word then last word (e.g. "TANA RIVER", 3 -> "TAR")
 */
export function locationSegmentAtLength(name: string, length: number): string {
  const cleaned = name.toUpperCase().trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const firstWord = parts[0];
    const lastWord = parts[parts.length - 1];
    let out = `${firstWord.substring(0, 2)}${lastWord.substring(0, 1)}`;
    let fi = 2;
    let li = 1;
    while (out.length < length) {
      if (fi < firstWord.length) {
        out += firstWord[fi++];
        continue;
      }
      if (li < lastWord.length) {
        out += lastWord[li++];
        continue;
      }
      break;
    }
    return out.substring(0, length);
  }
  return cleaned.substring(0, length);
}

/**
 * Current EPID location segment rule (3 characters):
 * - Single-word names: first 3 letters (e.g. "KISUMU" -> "KIS")
 * - Multi-word names: first 2 letters of first word + first letter of last word
 *   (e.g. "KISUMU CENTRAL" -> "KIC", "TANA RIVER" -> "TAR")
 */
export function locationSegment(name: string): string {
  return locationSegmentAtLength(name, 3);
}

/**
 * Build unique location segments for a set of names. Starts at minLen (default 3)
 * and extends up to maxLen when another name in the set shares the same segment.
 */
export function buildDisambiguatedSegmentRegistry(
  names: string[],
  minLen = 3,
  maxLen = 6,
): Map<string, string> {
  const normalized = [...new Set(names.map((n) => n.toUpperCase().trim()).filter(Boolean))];
  const result = new Map<string, string>();

  for (const name of normalized) {
    let len = minLen;
    let segment = locationSegmentAtLength(name, len);
    while (len <= maxLen) {
      segment = locationSegmentAtLength(name, len);
      const conflicts = normalized.filter(
        (other) => other !== name && locationSegmentAtLength(other, len) === segment,
      );
      if (conflicts.length === 0) break;
      len++;
    }
    result.set(name, segment);
  }

  return result;
}

export type ParsedEpid = {
  countrySeg: string;
  countySeg: string;
  subCountySeg: string;
  year: string;
  condition: string;
  seq: string;
};

/** Parse `CNT-COU-SUB-YEAR-CONDITION-SEQ` (condition may contain hyphens). */
export function parseEpid(epid: string): ParsedEpid | null {
  const parts = epid.trim().split("-").filter(Boolean);
  if (parts.length < 6) return null;
  const seq = parts[parts.length - 1];
  const year = parts[3];
  if (!/^\d{4}$/.test(year)) return null;
  const condition = parts.length === 6 ? parts[4] : parts.slice(4, -1).join("-");
  if (!condition) return null;
  return {
    countrySeg: parts[0],
    countySeg: parts[1],
    subCountySeg: parts[2],
    year,
    condition,
    seq,
  };
}

function padSeq(seq: string | number): string {
  const n = typeof seq === "number" ? seq : parseInt(seq, 10);
  if (!isNaN(n)) {
    return String(n).padStart(3, "0");
  }
  return String(seq).padStart(3, "0");
}

/** Build full EPID; countySegment must be pre-resolved (FHIR disambiguation for counties). */
export function buildEpidFormattedId(
  countryName: string,
  countySegment: string,
  subCountyName: string,
  year: string | number,
  condition: string,
  seq: string | number,
): string {
  return `${locationSegment(countryName)}-${countySegment}-${locationSegment(subCountyName)}-${year}-${condition}-${padSeq(seq)}`;
}

/** Location prefix only (first three EPID segments). */
export function epidLocationPrefix(
  countryName: string,
  countySegment: string,
  subCountyName: string,
): string {
  return `${locationSegment(countryName)}-${countySegment}-${locationSegment(subCountyName)}`;
}

export type ResolvedEpidLocation = {
  countryName: string;
  countyName: string;
  subCountyName: string;
};

/**
 * Resolve country / county / sub-county names from Encounter `a3-sub-county` Observation.
 */
export async function resolveLocationNamesForEncounter(
  encounterId: string,
  fhirApi: (params: { url: string }) => Promise<{ status: string; data: any }>,
): Promise<ResolvedEpidLocation | null> {
  const subCountyCode = "a3-sub-county";
  const subCountyObservation = (
    await fhirApi({ url: `/Observation?code=${subCountyCode}&encounter=${encounterId}` })
  ).data?.entry?.[0]?.resource;
  const vs = subCountyObservation?.valueString;
  const subCounty = vs ? await resolveSubCountyLocationByName(fhirApi, vs) : undefined;
  const county = subCounty?.partOf?.reference?.split("/")[1]
    ? (await fhirApi({ url: `/Location/${subCounty.partOf.reference.split("/")[1]}` })).data
    : undefined;
  const country =
    county?.partOf?.reference?.split("/")[1] != null
      ? (await fhirApi({ url: `/Location/${county.partOf.reference.split("/")[1]}` })).data
      : undefined;

  const subCountyName = subCounty?.name?.toUpperCase()?.trim();
  const countyName = county?.name?.toUpperCase()?.trim();
  const countryName = country?.name?.toUpperCase()?.trim();

  if (!countryName || !countyName || !subCountyName) return null;
  return { countryName, countyName, subCountyName };
}
