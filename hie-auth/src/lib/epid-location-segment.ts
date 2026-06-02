/**
 * EPID location segment rules (country / county / sub-county prefixes in EPID).
 */

/** Legacy rule: first 3 characters of the full name (pre multi-word fix). */
export function legacyLocationSegment(name: string): string {
  return name.toUpperCase().trim().substring(0, 3);
}

/**
 * Current EPID location segment rule:
 * - Single-word names: first 3 letters (e.g. "KISUMU" -> "KIS")
 * - Multi-word names: first 2 letters of first word + first letter of last word
 *   (e.g. "KISUMU CENTRAL" -> "KIC", "TANA RIVER" -> "TAR")
 */
export function locationSegment(name: string): string {
  const cleaned = name.toUpperCase().trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const firstWord = parts[0];
    const lastWord = parts[parts.length - 1];
    return `${firstWord.substring(0, 2)}${lastWord.substring(0, 1)}`;
  }
  return cleaned.substring(0, 3);
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

/** Build full EPID using current location segment rules. */
export function buildEpidFormattedId(
  countryName: string,
  countyName: string,
  subCountyName: string,
  year: string | number,
  condition: string,
  seq: string | number,
): string {
  return `${locationSegment(countryName)}-${locationSegment(countyName)}-${locationSegment(subCountyName)}-${year}-${condition}-${padSeq(seq)}`;
}

/** Location prefix only (first three EPID segments). */
export function epidLocationPrefix(
  countryName: string,
  countyName: string,
  subCountyName: string,
): string {
  return `${locationSegment(countryName)}-${locationSegment(countyName)}-${locationSegment(subCountyName)}`;
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
  const subCounty = vs
    ? (await fhirApi({ url: `/Location?name=${encodeURIComponent(vs)}` })).data?.entry?.[0]
        ?.resource
    : undefined;
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
