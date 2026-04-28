import type { LocationInfo } from '@/types/user';

export interface JwtClaims {
  sub: string;
  preferred_username?: string;
  email?: string;
  given_name?: string;
  family_name?: string;
  name?: string;
  exp?: number;
  iat?: number;
  realm_access?: { roles: string[] };
  resource_access?: Record<string, { roles: string[] }>;
  // NPHIIS custom claims (mapped from Keycloak user attributes)
  nphiis_role?: string;
  nphiis_location?: LocationInfo;
}

export interface DecodedSession {
  raw: string;
  claims: JwtClaims;
  roles: string[];
  locationInfo?: LocationInfo;
  isExpired: boolean;
}

function base64UrlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const b64 = (input + pad).replace(/-/g, '+').replace(/_/g, '/');
  if (typeof window === 'undefined') {
    return Buffer.from(b64, 'base64').toString('utf8');
  }
  return decodeURIComponent(
    atob(b64)
      .split('')
      .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join(''),
  );
}

export function decodeJwt(token: string): JwtClaims {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed JWT');
  return JSON.parse(base64UrlDecode(parts[1])) as JwtClaims;
}

export function buildSession(token: string): DecodedSession {
  const claims = decodeJwt(token);
  const realmRoles = claims.realm_access?.roles ?? [];
  const customRole = claims.nphiis_role ? [claims.nphiis_role] : [];
  // Dedupe; keep custom role first so single-role checks stay simple.
  const roles = Array.from(new Set([...customRole, ...realmRoles]));
  const now = Math.floor(Date.now() / 1000);
  return {
    raw: token,
    claims,
    roles,
    locationInfo: claims.nphiis_location,
    isExpired: typeof claims.exp === 'number' ? claims.exp <= now : false,
  };
}
