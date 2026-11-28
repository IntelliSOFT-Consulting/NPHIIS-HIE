import { NextRequest, NextResponse } from 'next/server';
import {
  forbidden,
  resolveUserProfile,
  unauthorized,
  verifyToken,
} from '@/lib/server-auth';
import { buildGuestRlsClauses, type RlsDataset } from '@/lib/superset-rls';
import { canAccess } from '@/lib/roles';

/** Server-side Superset base URL (Docker network preferred). */
const SUPERSET_URL = (
  process.env.SUPERSET_INTERNAL_URL ||
  process.env.SUPERSET_URL ||
  ''
).replace(/\/$/, '');
const SUPERSET_USER = process.env.SUPERSET_GUEST_USER;
const SUPERSET_PASSWORD = process.env.SUPERSET_GUEST_PASSWORD;

interface LoginResponse {
  access_token: string;
}

interface CsrfResponse {
  result: string;
}

interface GuestTokenResponse {
  token: string;
}

function mergeCookies(...headerValues: Array<string | null>): string {
  const parts: string[] = [];
  for (const h of headerValues) {
    if (!h) continue;
    for (const piece of h.split(/,(?=[^;]+?=)/)) {
      const pair = piece.split(';')[0]?.trim();
      if (pair) parts.push(pair);
    }
  }
  return parts.join('; ');
}

async function supersetLogin(): Promise<{ access: string; csrf: string; cookie: string }> {
  if (!SUPERSET_URL || !SUPERSET_USER || !SUPERSET_PASSWORD) {
    throw new Error('Superset env vars not set');
  }

  const loginRes = await fetch(`${SUPERSET_URL}/api/v1/security/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: SUPERSET_USER,
      password: SUPERSET_PASSWORD,
      provider: 'db',
      refresh: true,
    }),
  });
  if (!loginRes.ok) throw new Error(`Superset login failed: ${loginRes.status}`);
  const { access_token } = (await loginRes.json()) as LoginResponse;
  const loginCookie = loginRes.headers.get('set-cookie');

  const csrfRes = await fetch(`${SUPERSET_URL}/api/v1/security/csrf_token/`, {
    headers: {
      Authorization: `Bearer ${access_token}`,
      ...(loginCookie ? { Cookie: mergeCookies(loginCookie) } : {}),
    },
  });
  if (!csrfRes.ok) throw new Error(`Superset CSRF failed: ${csrfRes.status}`);
  const { result: csrf } = (await csrfRes.json()) as CsrfResponse;
  const cookie = mergeCookies(loginCookie, csrfRes.headers.get('set-cookie'));

  return { access: access_token, csrf, cookie };
}

/**
 * The datasets of the embedded dashboard [embedUuid] with their columns, so each gets a
 * clause it can run. Null when Superset cannot say (the clauses then apply to all datasets).
 */
async function dashboardDatasets(embedUuid: string, access: string): Promise<RlsDataset[] | null> {
  try {
    const headers = { Authorization: `Bearer ${access}` };
    const embedRes = await fetch(`${SUPERSET_URL}/api/v1/embedded_dashboard/${encodeURIComponent(embedUuid)}`, { headers });
    if (!embedRes.ok) return null;
    const dashboardId = (await embedRes.json())?.result?.dashboard_id;
    if (dashboardId == null) return null;
    const dsRes = await fetch(`${SUPERSET_URL}/api/v1/dashboard/${dashboardId}/datasets`, { headers });
    if (!dsRes.ok) return null;
    const ids = (((await dsRes.json())?.result ?? []) as Array<{ id: number }>).map((d) => d.id);
    // The dashboard listing returns only some columns; each dataset's own record has them all.
    const q = encodeURIComponent('(columns:!(columns.column_name))');
    const datasets = await Promise.all(
      ids.map(async (id) => {
        const res = await fetch(`${SUPERSET_URL}/api/v1/dataset/${id}?q=${q}`, { headers });
        if (!res.ok) throw new Error(`dataset ${id}: ${res.status}`);
        const cols = ((await res.json())?.result?.columns ?? []) as Array<{ column_name: string }>;
        return { id, columns: cols.map((c) => c.column_name) };
      }),
    );
    return datasets;
  } catch (err) {
    console.warn('Superset dashboard datasets lookup failed:', (err as Error).message);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const session = await verifyToken(req);
  if (!session) return unauthorized();
  // The Keycloak token has no location claim: the user's county / sub-county come from the
  // hie-auth profile. Without it area-limited users get the default-deny clause (all zeros).
  const { roles, locationInfo } = await resolveUserProfile(session);

  if (!canAccess(roles, 'REPORTS_VIEW_IDSR')) {
    return forbidden('Reports access not permitted');
  }

  const { dashboardId } = (await req.json()) as { dashboardId?: string };
  if (!dashboardId) {
    return NextResponse.json({ error: 'dashboardId required' }, { status: 400 });
  }

  try {
    const { access, csrf, cookie } = await supersetLogin();
    const rls = buildGuestRlsClauses(roles, locationInfo, await dashboardDatasets(dashboardId, access));

    const guestRes = await fetch(`${SUPERSET_URL}/api/v1/security/guest_token/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${access}`,
        'X-CSRFToken': csrf,
        Cookie: cookie,
        // Superset's CSRF middleware rejects the request with
        // `400 Bad Request: The referrer header is missing.` when no
        // Referer is sent. Server-to-server fetch() doesn't add one
        // automatically, so we set it explicitly to the Superset origin.
        Referer: `${SUPERSET_URL}/`,
      },
      body: JSON.stringify({
        user: {
          username:
            (session.payload.preferred_username as string | undefined) ??
            session.payload.sub ??
            'nphiis-user',
          first_name: (session.payload.given_name as string | undefined) ?? '',
          last_name: (session.payload.family_name as string | undefined) ?? '',
        },
        resources: [{ type: 'dashboard', id: dashboardId }],
        rls,
      }),
    });

    if (!guestRes.ok) {
      const text = await guestRes.text();
      console.error('Superset guest_token error:', guestRes.status, text);
      return NextResponse.json({ error: 'Superset guest token failed' }, { status: 502 });
    }

    const { token } = (await guestRes.json()) as GuestTokenResponse;
    return NextResponse.json({ token, dashboardId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Guest token route error:', msg);
    return NextResponse.json({ error: `Internal error: ${msg}` }, { status: 500 });
  }
}
