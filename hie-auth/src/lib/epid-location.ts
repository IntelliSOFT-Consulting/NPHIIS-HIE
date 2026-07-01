export const LOCATION_TYPE_SYSTEM = "http://terminology.hl7.org/CodeSystem/v3-RoleCode";
export const SUB_COUNTY_CODE = "SUB-COUNTY";
export const COUNTY_CODE = "COUNTY";

type FhirApiLike = (params: { url: string }) => Promise<{ data?: any }>;

function locationHasType(location: any, expectedTypeCode: string): boolean {
  const codings = location?.type?.[0]?.coding;
  if (!Array.isArray(codings)) return false;
  return codings.some(
    (coding: any) =>
      coding?.system === LOCATION_TYPE_SYSTEM && coding?.code === expectedTypeCode,
  );
}

function getFirstLocationResource(bundle: any): any | undefined {
  const entries = bundle?.entry;
  if (!Array.isArray(entries) || entries.length === 0) return undefined;
  return entries[0]?.resource;
}

export async function resolveSubCountyLocationByName(
  fhirApi: FhirApiLike,
  rawName: string,
): Promise<any | undefined> {
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (!name) return undefined;

  const typed = await fhirApi({
    url: `/Location?name=${encodeURIComponent(name)}&type=${encodeURIComponent(`${LOCATION_TYPE_SYSTEM}|${SUB_COUNTY_CODE}`)}`,
  });
  const typedLoc = getFirstLocationResource(typed?.data);
  if (typedLoc) return typedLoc;

  const byName = await fhirApi({ url: `/Location?name=${encodeURIComponent(name)}` });
  const entries = Array.isArray(byName?.data?.entry) ? byName.data.entry : [];
  const typedMatch = entries.find((e: any) => locationHasType(e?.resource, SUB_COUNTY_CODE))
    ?.resource;
  if (typedMatch) return typedMatch;

  return getFirstLocationResource(byName?.data);
}

export async function resolveLocationHierarchy(
  fhirApi: FhirApiLike,
  subCountyNameFromObservation: string,
): Promise<{ subCounty: any; county: any; country: any }> {
  const subCounty = await resolveSubCountyLocationByName(fhirApi, subCountyNameFromObservation);
  if (!subCounty) {
    throw new Error(
      `Ambiguous or missing SUB-COUNTY Location for name ${String(subCountyNameFromObservation)}`,
    );
  }

  const countyId = subCounty?.partOf?.reference?.split("/")[1];
  const county = countyId ? (await fhirApi({ url: `/Location/${countyId}` })).data : undefined;

  const countryId = county?.partOf?.reference?.split("/")[1];
  const country = countryId ? (await fhirApi({ url: `/Location/${countryId}` })).data : undefined;

  return { subCounty, county, country };
}
