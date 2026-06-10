import { getKeycloakUserById } from "./keycloak";
import { resolvePractitionerAssignment } from "./practitioner-role";
import { FhirApi } from "./utils";

export const NOT_RECORDED = "Not recorded";

export type CaseSubmitterInfo = {
  name: string;
  role: string;
  facility: string;
};

type FhirRef = { reference?: string; display?: string };

export function practitionerIdFromReference(
  ref: string | null | undefined,
): string | null {
  if (!ref?.trim()) return null;
  const trimmed = ref.trim();
  if (!trimmed.startsWith("Practitioner/")) return null;
  const id = trimmed.split("/")[1]?.trim();
  return id || null;
}

export function formatRoleLabel(roleCode: string | null | undefined): string {
  if (!roleCode?.trim()) return NOT_RECORDED;
  return roleCode
    .trim()
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function formatHumanName(
  name: { given?: string[]; family?: string } | null | undefined,
): string | null {
  if (!name) return null;
  const given = Array.isArray(name.given)
    ? name.given.filter(Boolean).join(" ").trim()
    : "";
  const family = name.family?.trim() ?? "";
  const full = [given, family].filter(Boolean).join(" ").trim();
  return full || null;
}

export function formatKeycloakName(user: {
  firstName?: string;
  lastName?: string;
} | null | undefined): string | null {
  if (!user) return null;
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return full || null;
}

function extractPractitionerIdFromEncounter(encounter: unknown): {
  practitionerId: string | null;
  displayName: string | null;
} {
  const enc = encounter as {
    participant?: Array<{ individual?: FhirRef }>;
  };
  const individual = enc?.participant?.[0]?.individual;
  if (!individual) return { practitionerId: null, displayName: null };
  return {
    practitionerId: practitionerIdFromReference(individual.reference),
    displayName: individual.display?.trim() || null,
  };
}

async function practitionerIdFromQuestionnaireResponse(
  encounterId: string,
): Promise<string | null> {
  const resp = await FhirApi({
    url: `/QuestionnaireResponse?encounter=Encounter/${encodeURIComponent(encounterId)}&_sort=-authored&_count=1`,
  });
  const bundle = resp.data as {
    entry?: Array<{ resource?: { author?: FhirRef } }>;
  };
  const author = bundle?.entry?.[0]?.resource?.author;
  return practitionerIdFromReference(author?.reference);
}

async function practitionerIdFromObservation(
  encounterId: string,
): Promise<string | null> {
  const resp = await FhirApi({
    url: `/Observation?encounter=Encounter/${encodeURIComponent(encounterId)}&performer:missing=false&_count=1`,
  });
  const bundle = resp.data as {
    entry?: Array<{ resource?: { performer?: FhirRef[] } }>;
  };
  const performer = bundle?.entry?.[0]?.resource?.performer?.[0];
  return practitionerIdFromReference(performer?.reference);
}

async function resolvePractitionerId(
  encounter: unknown,
  encounterId: string,
): Promise<{ practitionerId: string | null; displayName: string | null }> {
  const fromEncounter = extractPractitionerIdFromEncounter(encounter);
  if (fromEncounter.practitionerId) return fromEncounter;

  const fromQr = await practitionerIdFromQuestionnaireResponse(encounterId);
  if (fromQr) return { practitionerId: fromQr, displayName: null };

  const fromObs = await practitionerIdFromObservation(encounterId);
  if (fromObs) return { practitionerId: fromObs, displayName: null };

  return { practitionerId: null, displayName: null };
}

function encounterFacilityDisplay(encounter: unknown): string | null {
  const enc = encounter as {
    location?: Array<{ location?: FhirRef }>;
  };
  return enc?.location?.[0]?.location?.display?.trim() || null;
}

async function resolveFacilityName(
  encounter: unknown,
  practitionerId: string | null,
  practitionerResource: unknown,
): Promise<string> {
  const fromEncounter = encounterFacilityDisplay(encounter);
  if (fromEncounter) return fromEncounter;

  if (practitionerId) {
    const assignment = await resolvePractitionerAssignment(
      practitionerId,
      practitionerResource,
    );
    if (assignment?.locationDisplay?.trim()) {
      return assignment.locationDisplay.trim();
    }
    if (assignment?.locationReference) {
      const locationId = assignment.locationReference.split("/")[1]?.trim();
      if (locationId) {
        const locResp = await FhirApi({ url: `/Location/${locationId}` });
        const loc = locResp.data as { name?: string };
        if (loc?.name?.trim()) return loc.name.trim();
      }
    }
  }

  return NOT_RECORDED;
}

async function resolveSubmitterName(
  practitionerId: string | null,
  practitionerResource: unknown,
  participantDisplay: string | null,
): Promise<string> {
  if (participantDisplay) return participantDisplay;

  const practitioner = practitionerResource as {
    name?: Array<{ given?: string[]; family?: string }>;
  };
  const fromFhir = formatHumanName(practitioner?.name?.[0]);
  if (fromFhir) return fromFhir;

  if (practitionerId) {
    const kcUser = await getKeycloakUserById(practitionerId);
    const fromKc = formatKeycloakName(kcUser);
    if (fromKc) return fromKc;
  }

  return NOT_RECORDED;
}

async function resolveSubmitterRole(
  practitionerId: string | null,
  practitionerResource: unknown,
): Promise<string> {
  if (practitionerId) {
    const kcUser = await getKeycloakUserById(practitionerId);
    const kcRole = kcUser?.attributes?.practitionerRole?.[0];
    if (kcRole?.trim()) return formatRoleLabel(kcRole);
  }

  const assignment = practitionerId
    ? await resolvePractitionerAssignment(practitionerId, practitionerResource)
    : null;
  if (assignment?.role?.trim()) return formatRoleLabel(assignment.role);

  return NOT_RECORDED;
}

/**
 * Resolves the practitioner who submitted a case from the Encounter and related FHIR resources.
 */
export async function resolveCaseSubmitterInfo(
  encounterResource: unknown,
  encounterId: string,
): Promise<CaseSubmitterInfo> {
  const { practitionerId, displayName } = await resolvePractitionerId(
    encounterResource,
    encounterId,
  );

  let practitionerResource: unknown = null;
  if (practitionerId) {
    const resp = await FhirApi({ url: `/Practitioner/${practitionerId}` });
    if (
      resp.status === "success" &&
      (resp.data as { resourceType?: string })?.resourceType === "Practitioner"
    ) {
      practitionerResource = resp.data;
    }
  }

  const [name, role, facility] = await Promise.all([
    resolveSubmitterName(practitionerId, practitionerResource, displayName),
    resolveSubmitterRole(practitionerId, practitionerResource),
    resolveFacilityName(encounterResource, practitionerId, practitionerResource),
  ]);

  return { name, role, facility };
}
