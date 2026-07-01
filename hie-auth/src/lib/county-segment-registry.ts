import { COUNTY_CODE, LOCATION_TYPE_SYSTEM } from "./epid-location";
import {
  buildDisambiguatedSegmentRegistry,
  locationSegment,
} from "./epid-location-segment";

type FhirApiLike = (params: { url: string }) => Promise<{ data?: unknown }>;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 100;

let cachedRegistry: Map<string, string> | null = null;
let cacheLoadedAt = 0;

function normalizeCountyName(name: string): string {
  return name.toUpperCase().trim();
}

/** Paginated FHIR search for all COUNTY Location display names. */
export async function fetchAllCountyNames(fhirApi: FhirApiLike): Promise<string[]> {
  const names: string[] = [];
  let offset = 0;

  while (true) {
    const typeParam = encodeURIComponent(`${LOCATION_TYPE_SYSTEM}|${COUNTY_CODE}`);
    const resp = await fhirApi({
      url: `/Location?type=${typeParam}&_count=${PAGE_SIZE}&_offset=${offset}`,
    });
    const bundle = resp.data as { entry?: Array<{ resource?: { name?: string } }> } | undefined;
    const entries = bundle?.entry;
    if (!Array.isArray(entries) || entries.length === 0) break;

    for (const entry of entries) {
      const name = entry?.resource?.name;
      if (typeof name === "string" && name.trim()) {
        names.push(name.trim());
      }
    }

    if (entries.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return names;
}

/** Pure disambiguation wrapper for tests and registry build. */
export function buildCountySegmentRegistry(
  names: string[],
  minLen = 3,
  maxLen = 6,
): Map<string, string> {
  return buildDisambiguatedSegmentRegistry(names, minLen, maxLen);
}

export async function getCountySegmentRegistry(
  fhirApi: FhirApiLike,
  forceRefresh = false,
): Promise<Map<string, string>> {
  const now = Date.now();
  if (!forceRefresh && cachedRegistry && now - cacheLoadedAt < CACHE_TTL_MS) {
    return cachedRegistry;
  }

  const names = await fetchAllCountyNames(fhirApi);
  cachedRegistry = buildCountySegmentRegistry(names);
  cacheLoadedAt = now;
  return cachedRegistry;
}

/** Resolve disambiguated county EPID segment; falls back to 3-char rule on FHIR failure. */
export async function resolveCountyLocationSegment(
  fhirApi: FhirApiLike,
  countyName: string,
): Promise<string> {
  const key = normalizeCountyName(countyName);
  if (!key) return locationSegment(countyName);

  try {
    let registry = await getCountySegmentRegistry(fhirApi);
    let segment = registry.get(key);
    if (segment) return segment;

    registry = await getCountySegmentRegistry(fhirApi, true);
    segment = registry.get(key);
    if (segment) return segment;
  } catch (error) {
    console.warn(
      `County segment registry load failed for "${countyName}", falling back to 3-char rule:`,
      error,
    );
    return locationSegment(countyName);
  }

  console.warn(
    `County "${countyName}" not found in FHIR COUNTY registry, falling back to 3-char rule`,
  );
  return locationSegment(countyName);
}

/** Test-only cache reset. */
export function resetCountySegmentRegistryCacheForTests(): void {
  cachedRegistry = null;
  cacheLoadedAt = 0;
}
