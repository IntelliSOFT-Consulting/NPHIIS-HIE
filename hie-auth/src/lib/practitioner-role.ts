import { FhirApi } from "./utils";

export const ROLE_GROUP_EXTENSION_URL =
  "http://example.org/fhir/StructureDefinition/role-group";

export const LOCATION_EXTENSION_URL = "http://example.org/location";

export const NPHIIS_ROLE_CODE_SYSTEM =
  "https://nphiis.health.go.ke/fhir/CodeSystem/nphiis-roles";

export const ASSIGNED_BY_EXTENSION_URL =
  "https://nphiis.health.go.ke/fhir/StructureDefinition/assigned-by";

export type PractitionerRoleLocation = {
  id: string;
  name?: string;
};

export type ResolvedPractitionerAssignment = {
  role: string;
  locationReference: string | null;
  locationDisplay: string | null;
  source: "PractitionerRole" | "Practitioner";
};

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

export function getLocationFromPractitioner(practitioner: unknown): {
  reference: string | null;
  display: string | null;
} {
  const ext = (practitioner as { extension?: unknown })?.extension;
  if (!Array.isArray(ext)) return { reference: null, display: null };
  const locationExt = ext.find(
    (e: { url?: string }) => e?.url === LOCATION_EXTENSION_URL,
  );
  const ref = locationExt?.valueReference?.reference;
  const display = locationExt?.valueReference?.display;
  return {
    reference: typeof ref === "string" && ref.trim() ? ref.trim() : null,
    display: typeof display === "string" && display.trim() ? display.trim() : null,
  };
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

export function rolesEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
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

/** "COUNTY_DISEASE_SURVEILLANCE_OFFICER" → "County Disease Surveillance Officer" */
export function formatRoleDisplay(role: string): string {
  return role
    .toLowerCase()
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

export function buildPractitionerRoleResource(
  practitionerId: string,
  role: string,
  location: PractitionerRoleLocation,
  options?: {
    assignedByPractitionerId?: string;
    active?: boolean;
    periodStart?: string;
    existingResource?: Record<string, unknown>;
  },
): Record<string, unknown> {
  const periodStart =
    options?.periodStart ??
    (options?.existingResource?.period as { start?: string } | undefined)
      ?.start ??
    new Date().toISOString();

  const resource: Record<string, unknown> = {
    resourceType: "PractitionerRole",
    id: practitionerId,
    active: options?.active ?? true,
    period: { start: periodStart },
    practitioner: { reference: `Practitioner/${practitionerId}` },
    location: [
      {
        reference: `Location/${location.id}`,
        ...(location.name ? { display: location.name } : {}),
      },
    ],
    code: [
      {
        coding: [
          {
            system: NPHIIS_ROLE_CODE_SYSTEM,
            code: role,
            display: formatRoleDisplay(role),
          },
        ],
      },
    ],
  };

  if (options?.assignedByPractitionerId) {
    resource.extension = [
      {
        url: ASSIGNED_BY_EXTENSION_URL,
        valueReference: {
          reference: `Practitioner/${options.assignedByPractitionerId}`,
        },
      },
    ];
  } else if (Array.isArray(options?.existingResource?.extension)) {
    resource.extension = options.existingResource.extension;
  }

  return resource;
}

export function getRoleFromPractitionerRoleResource(
  practitionerRole: unknown,
): string | null {
  const code = (practitionerRole as { code?: unknown })?.code;
  if (!Array.isArray(code)) return null;

  for (const concept of code) {
    const coding = (concept as { coding?: unknown })?.coding;
    if (!Array.isArray(coding)) continue;
    for (const c of coding) {
      const system = (c as { system?: string })?.system;
      const codeValue = (c as { code?: string })?.code;
      if (
        typeof codeValue === "string" &&
        codeValue.trim() &&
        (!system || system === NPHIIS_ROLE_CODE_SYSTEM)
      ) {
        return codeValue.trim();
      }
    }
  }
  return null;
}

export function getLocationFromPractitionerRoleResource(
  practitionerRole: unknown,
): { reference: string | null; display: string | null } {
  const location = (practitionerRole as { location?: unknown })?.location;
  if (!Array.isArray(location) || !location.length) {
    return { reference: null, display: null };
  }
  const first = location[0] as {
    reference?: string;
    display?: string;
  };
  const reference =
    typeof first?.reference === "string" && first.reference.trim()
      ? first.reference.trim()
      : null;
  const display =
    typeof first?.display === "string" && first.display.trim()
      ? first.display.trim()
      : null;
  return { reference, display };
}

export async function getPractitionerRole(
  practitionerId: string,
): Promise<Record<string, unknown> | null> {
  const byId = await FhirApi({ url: `/PractitionerRole/${practitionerId}` });
  if (
    byId.status === "success" &&
    (byId.data as { resourceType?: string })?.resourceType === "PractitionerRole"
  ) {
    return byId.data as Record<string, unknown>;
  }

  const search = await FhirApi({
    url: `/PractitionerRole?practitioner=Practitioner/${practitionerId}&_count=1`,
  });
  const bundle = search.data as {
    resourceType?: string;
    entry?: Array<{ resource?: Record<string, unknown> }>;
  };
  if (bundle?.resourceType !== "Bundle" || !Array.isArray(bundle.entry)) {
    return null;
  }
  const resource = bundle.entry.find(
    (e) => (e.resource as { resourceType?: string })?.resourceType === "PractitionerRole",
  )?.resource;
  return resource ?? null;
}

export function resolveAssignmentFromPractitionerRole(
  practitionerRole: unknown,
): ResolvedPractitionerAssignment | null {
  const role = getRoleFromPractitionerRoleResource(practitionerRole);
  if (!role) return null;
  const location = getLocationFromPractitionerRoleResource(practitionerRole);
  return {
    role,
    locationReference: location.reference,
    locationDisplay: location.display,
    source: "PractitionerRole",
  };
}

export function resolveAssignmentFromPractitioner(
  practitioner: unknown,
): ResolvedPractitionerAssignment | null {
  const role = getRoleFromPractitioner(practitioner);
  if (!role) return null;
  const location = getLocationFromPractitioner(practitioner);
  return {
    role,
    locationReference: location.reference,
    locationDisplay: location.display,
    source: "Practitioner",
  };
}

/** Prefer PractitionerRole; fall back to Practitioner extensions. */
export async function resolvePractitionerAssignment(
  practitionerId: string,
  practitioner?: unknown,
): Promise<ResolvedPractitionerAssignment | null> {
  const practitionerRole = await getPractitionerRole(practitionerId);
  if (practitionerRole) {
    const fromRole = resolveAssignmentFromPractitionerRole(practitionerRole);
    if (fromRole) return fromRole;
  }

  let practitionerResource = practitioner;
  if (!practitionerResource) {
    const resp = await FhirApi({ url: `/Practitioner/${practitionerId}` });
    if (
      resp.status === "success" &&
      (resp.data as { resourceType?: string })?.resourceType === "Practitioner"
    ) {
      practitionerResource = resp.data;
    }
  }

  if (practitionerResource) {
    return resolveAssignmentFromPractitioner(practitionerResource);
  }

  return null;
}

export async function putPractitionerRoleResource(
  practitionerId: string,
  role: string,
  location: PractitionerRoleLocation,
  options?: {
    assignedByPractitionerId?: string;
    active?: boolean;
    periodStart?: string;
  },
): Promise<Record<string, unknown> | null> {
  const existing = await getPractitionerRole(practitionerId);
  const resource = buildPractitionerRoleResource(
    practitionerId,
    role,
    location,
    {
      ...options,
      existingResource: existing ?? undefined,
    },
  );

  const response = await FhirApi({
    url: `/PractitionerRole/${practitionerId}`,
    method: "PUT",
    data: JSON.stringify(resource),
  });

  if (
    response.status === "success" &&
    (response.data as { resourceType?: string })?.resourceType === "PractitionerRole"
  ) {
    return response.data as Record<string, unknown>;
  }

  if ((response.data as { resourceType?: string })?.resourceType === "OperationOutcome") {
    const issue = (response.data as { issue?: Array<{ diagnostics?: string }> })?.issue?.[0];
    throw new Error(issue?.diagnostics ?? "Failed to upsert PractitionerRole");
  }

  return null;
}

export async function deletePractitionerRoleResource(
  practitionerId: string,
): Promise<boolean> {
  const existing = await getPractitionerRole(practitionerId);
  if (!existing) return true;

  const response = await FhirApi({
    url: `/PractitionerRole/${practitionerId}`,
    method: "DELETE",
  });
  return response.status === "success";
}

export function buildPractitionerExtensions(
  role: string,
  location: PractitionerRoleLocation,
): Array<Record<string, unknown>> {
  return [
    {
      url: LOCATION_EXTENSION_URL,
      valueReference: {
        reference: `Location/${location.id}`,
        ...(location.name ? { display: location.name } : {}),
      },
    },
    {
      url: ROLE_GROUP_EXTENSION_URL,
      valueString: role,
    },
  ];
}

export async function syncPractitionerRoleAndExtensions(
  practitionerId: string,
  role: string,
  location: PractitionerRoleLocation,
  options?: {
    assignedByPractitionerId?: string;
    practitioner?: Record<string, unknown>;
  },
): Promise<void> {
  await putPractitionerRoleResource(practitionerId, role, location, options);

  let practitioner = options?.practitioner;
  if (!practitioner) {
    const resp = await FhirApi({ url: `/Practitioner/${practitionerId}` });
    if (
      resp.status === "success" &&
      (resp.data as { resourceType?: string })?.resourceType === "Practitioner"
    ) {
      practitioner = resp.data as Record<string, unknown>;
    }
  }

  if (!practitioner) {
    throw new Error(`Practitioner/${practitionerId} not found`);
  }

  await FhirApi({
    url: `/Practitioner/${practitionerId}`,
    method: "PUT",
    data: JSON.stringify({
      ...practitioner,
      extension: buildPractitionerExtensions(role, location),
      meta: {
        ...(practitioner.meta as Record<string, unknown> | undefined),
        tag: [
          {
            system: "http://example.org/fhir/StructureDefinition/location",
            code: `Location/${location.id}`,
          },
        ],
      },
    }),
  });
}

const ADMIN_ROLES = new Set(["ADMINISTRATOR", "SUPERUSER"]);

/**
 * True only when the practitioner's assigned role is ADMINISTRATOR or
 * SUPERUSER. A missing or unreadable role is not an admin.
 */
export async function isAdminPractitioner(
  practitionerId: string,
  practitioner?: unknown,
): Promise<boolean> {
  const assignment = await resolvePractitionerAssignment(practitionerId, practitioner);
  const role = assignment?.role ?? getRoleFromPractitioner(practitioner);
  return !!role && ADMIN_ROLES.has(role.toUpperCase());
}
