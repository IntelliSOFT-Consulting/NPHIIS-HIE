"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { LocationInfo } from "@/types/user";
import { buildSession, type DecodedSession } from "@/lib/jwt";
import {
  canAccess,
  hasAnyRole,
  isApplicationRole,
  type Feature,
  type Role,
} from "@/lib/roles";

const STORAGE_KEY = "nphiis-admin-auth";

export interface SessionUser {
  id: string;
  username: string;
  name?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  fhirPractitionerId?: string;
}

export interface StoredAuth {
  userInfo: SessionUser & Record<string, unknown>;
  accessToken: string;
  refreshToken?: string;
  timestamp: number;
}

interface AuthContextValue {
  session: DecodedSession | null;
  user: SessionUser | null;
  roles: string[];
  locationInfo?: LocationInfo;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasRole: (allowed: readonly string[] | Role | Role[]) => boolean;
  can: (feature: Feature) => boolean;
  signIn: (auth: StoredAuth) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStorage(): StoredAuth | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredAuth) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<StoredAuth | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setStored(readStorage());
    setIsLoading(false);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setStored(readStorage());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const session = useMemo<DecodedSession | null>(() => {
    if (!stored?.accessToken) return null;
    try {
      return buildSession(stored.accessToken);
    } catch {
      return null;
    }
  }, [stored]);

  const signIn = useCallback((auth: StoredAuth) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
    setStored(auth);
  }, []);

  const signOut = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    setStored(null);
  }, []);

  const user: SessionUser | null = useMemo(() => {
    if (!stored) return null;
    const u = stored.userInfo;
    return {
      id: String(u.id ?? session?.claims.sub ?? ""),
      username:
        (u.username as string | undefined) ??
        (u.preferred_username as string | undefined) ??
        session?.claims.preferred_username ??
        "",
      name: (u.name as string | undefined) ?? session?.claims.name,
      email: (u.email as string | undefined) ?? session?.claims.email,
      firstName:
        (u.firstName as string | undefined) ?? session?.claims.given_name,
      lastName:
        (u.lastName as string | undefined) ?? session?.claims.family_name,
      role: u.role as string | undefined,
      fhirPractitionerId: u.fhirPractitionerId as string | undefined,
    };
  }, [stored, session]);

  // Roles come from three places: the JWT's realm_access (noisy - includes
  // Keycloak built-ins like `default-roles-<realm>`), the JWT's custom
  // `nphiis_role` claim, and the canonical `user.role` from /provider/me.
  // Prefer the canonical role first, then filter out Keycloak noise.
  const roles = useMemo(() => {
    const ordered: string[] = [];
    if (user?.role) ordered.push(user.role);
    for (const r of session?.roles ?? []) {
      if (!ordered.includes(r)) ordered.push(r);
    }
    return ordered.filter(isApplicationRole);
  }, [session, user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      roles,
      // Prefer JWT-embedded claim (once Keycloak mapper is wired); fall back to
      // whatever /provider/me returned and we stashed in localStorage.
      locationInfo:
        session?.locationInfo ??
        (stored?.userInfo?.locationInfo as LocationInfo | undefined),
      accessToken: stored?.accessToken ?? null,
      isAuthenticated:
        Boolean(stored?.accessToken) && !(session?.isExpired ?? false),
      isLoading,
      hasRole: (allowed) => {
        const list = Array.isArray(allowed) ? allowed : [allowed as string];
        return hasAnyRole(roles, list);
      },
      can: (feature) => canAccess(roles, feature),
      signIn,
      signOut,
    }),
    [session, user, roles, stored, isLoading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

/**
 * fetch() wrapper that injects the Bearer token and signs the user out the
 * moment the server returns 401. Without this, an expired token leaves the
 * UI in a confusing half-state where API calls keep failing but the form
 * still looks logged in. Use it for any authenticated client-side call.
 */
export function useAuthedFetch() {
  const { accessToken, signOut } = useAuth();
  return useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      if (accessToken && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${accessToken}`);
      }
      const res = await fetch(input, { ...init, headers });
      if (res.status === 401) {
        // Token rejected — wipe the session so the UI bounces to /login.
        signOut();
        if (typeof window !== "undefined" && window.location.pathname !== "/") {
          window.location.assign("/");
        }
      }
      return res;
    },
    [accessToken, signOut],
  );
}
