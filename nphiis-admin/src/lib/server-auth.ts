import { NextRequest, NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { LocationInfo } from "@/types/user";

export interface VerifiedToken {
  raw: string;
  payload: JWTPayload & {
    preferred_username?: string;
    email?: string;
    given_name?: string;
    family_name?: string;
    realm_access?: { roles: string[] };
    nphiis_role?: string;
    nphiis_location?: LocationInfo;
  };
  roles: string[];
  locationInfo?: LocationInfo;
}

const KEYCLOAK_URL =
  process.env.KEYCLOAK_URL ?? process.env.NEXT_PUBLIC_KEYCLOAK_URL ?? "";
const KEYCLOAK_REALM =
  process.env.KEYCLOAK_REALM ?? process.env.NEXT_PUBLIC_KEYCLOAK_REALM ?? "";
const ISSUER =
  KEYCLOAK_URL && KEYCLOAK_REALM
    ? `${KEYCLOAK_URL.replace(/\/$/, "")}/realms/${KEYCLOAK_REALM}`
    : "";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!ISSUER) return null;
  if (!jwks)
    jwks = createRemoteJWKSet(
      new URL(`${ISSUER}/protocol/openid-connect/certs`),
    );
  return jwks;
}

function bearer(req: NextRequest): string | null {
  const h =
    req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

export async function verifyToken(
  req: NextRequest,
): Promise<VerifiedToken | null> {
  const token = bearer(req);
  if (!token) return null;

  // Fail closed: without Keycloak configured, or if its signing keys can't be
  // fetched, no token can be verified, so none is accepted.
  const ks = getJwks();
  if (!ks) {
    console.error(
      "[auth] verifyToken: KEYCLOAK_URL / KEYCLOAK_REALM not set; rejecting all tokens",
    );
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, ks, { issuer: ISSUER });
    return wrap(token, payload as VerifiedToken["payload"]);
  } catch (err) {
    console.warn("[auth] JWT verification failed:", (err as Error).message);
    return null;
  }
}

function wrap(token: string, payload: VerifiedToken["payload"]): VerifiedToken {
  const realmRoles = payload.realm_access?.roles ?? [];
  const customRole = payload.nphiis_role ? [payload.nphiis_role] : [];
  return {
    raw: token,
    payload,
    roles: Array.from(new Set([...customRole, ...realmRoles])),
    locationInfo: payload.nphiis_location,
  };
}

export function unauthorized(message = "Unauthorized"): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbidden(message = "Forbidden"): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

// The NPHIIS application role and the FHIR Practitioner id live on the
// provider record, not in the Keycloak token, so we ask hie-auth for them.
// Small in-memory cache keyed by the token itself so repeated requests from
// the same session skip the call.
const API_HOST = process.env.API_HOST ?? process.env.NEXT_PUBLIC_API_HOST ?? "";

export interface UserProfile {
  roles: string[];
  practitionerId?: string;
  locationInfo?: LocationInfo;
}

interface CacheEntry extends UserProfile {
  expiresAt: number;
}

const profileCache = new Map<string, CacheEntry>();
const PROFILE_TTL_MS = 60_000;

interface ProviderMeResponse {
  status?: string;
  user?: {
    role?: string;
    fhirPractitionerId?: string;
    locationInfo?: LocationInfo;
  };
}

async function fetchProfile(session: VerifiedToken): Promise<UserProfile> {
  const cached = profileCache.get(session.raw);
  if (cached && cached.expiresAt > Date.now()) return cached;
  if (!API_HOST) {
    console.warn(
      "[auth] fetchProfile: API_HOST not set; falling back to token roles only",
    );
    return { roles: [], locationInfo: session.locationInfo };
  }
  try {
    const res = await fetch(`${API_HOST}/provider/me`, {
      headers: {
        Authorization: `Bearer ${session.raw}`,
        Cookie: "frontend_lang=en_US",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(
        `[auth] fetchProfile: /provider/me -> ${res.status} ${res.statusText}`,
        body.slice(0, 200),
      );
      return { roles: [], locationInfo: session.locationInfo };
    }
    const data = (await res.json()) as ProviderMeResponse;
    const profile: UserProfile = {
      roles: data.user?.role ? [data.user.role] : [],
      practitionerId: data.user?.fhirPractitionerId,
      locationInfo: data.user?.locationInfo ?? session.locationInfo,
    };
    profileCache.set(session.raw, {
      ...profile,
      expiresAt: Date.now() + PROFILE_TTL_MS,
    });
    return profile;
  } catch (err) {
    console.warn("[auth] fetchProfile threw:", (err as Error).message);
    return { roles: [], locationInfo: session.locationInfo };
  }
}

export async function resolveUserRoles(session: VerifiedToken): Promise<string[]> {
  const profile = await fetchProfile(session);
  return Array.from(new Set([...session.roles, ...profile.roles]));
}

/** Full user profile merged with token-derived roles/location. */
export async function resolveUserProfile(
  session: VerifiedToken,
): Promise<UserProfile> {
  const profile = await fetchProfile(session);
  return {
    roles: Array.from(new Set([...session.roles, ...profile.roles])),
    practitionerId: profile.practitionerId,
    locationInfo: profile.locationInfo ?? session.locationInfo,
  };
}
