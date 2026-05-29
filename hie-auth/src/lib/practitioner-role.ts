export const ROLE_GROUP_EXTENSION_URL =
  "http://example.org/fhir/StructureDefinition/role-group";

/** Extract practitioner role from FHIR Practitioner `role-group` extension (not by index). */
export function getRoleFromPractitioner(practitioner: unknown): string | null {
  const ext = (practitioner as { extension?: unknown })?.extension;
  if (!Array.isArray(ext)) return null;
  const roleExt = ext.find(
    (e: { url?: string }) => e?.url === ROLE_GROUP_EXTENSION_URL,
  );
  const value = roleExt?.valueString;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

/** Keycloak user id used as FHIR Practitioner id when `fhirPractitionerId` attribute is unset. */
export function resolvePractitionerIdForKeycloakUser(user: {
  id?: string;
  attributes?: Record<string, string[] | undefined>;
}): string | null {
  const fromAttr = user.attributes?.fhirPractitionerId?.[0]?.trim();
  if (fromAttr) return fromAttr;
  const id = user.id?.trim();
  return id || null;
}

export function rolesEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

/** Keycloak attributes written for provider users (registration + backfill). */
export function providerRoleKeycloakAttributes(
  practitionerId: string,
  role: string,
): Record<string, string[]> {
  return {
    practitionerRole: [role],
    nphiis_role: [role],
    fhirPractitionerId: [practitionerId],
  };
}
