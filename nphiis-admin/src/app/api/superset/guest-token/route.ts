import { NextRequest, NextResponse } from 'next/server';
import {
  forbidden,
  resolveUserRoles,
  unauthorized,
  verifyToken,
} from '@/lib/server-auth';
import { buildRlsClauses } from '@/lib/superset-rls';
import { canAccess } from '@/lib/roles';

const SUPERSET_URL = process.env.SUPERSET_URL?.replace(/\/$/, '');
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

  const csrfRes = await fetch(`${SUPERSET_URL}/api/v1/security/csrf_token/`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!csrfRes.ok) throw new Error(`Superset CSRF failed: ${csrfRes.status}`);
  const { result: csrf } = (await csrfRes.json()) as CsrfResponse;
  const cookie = csrfRes.headers.get('set-cookie') ?? '';

  return { access: access_token, csrf, cookie };
}

export async function POST(req: NextRequest) {
  const session = await verifyToken(req);
  if (!session) return unauthorized();
  const roles = await resolveUserRoles(session);

  if (
    !canAccess(roles, 'REPORTS_VIEW_502') &&
    !canAccess(roles, 'REPORTS_VIEW_505') &&
    !canAccess(roles, 'REPORTS_VIEW_IDSR')
  ) {
    return forbidden('Reports access not permitted');
  }

  const { dashboardId } = (await req.json()) as { dashboardId?: string };
  if (!dashboardId) {
    return NextResponse.json({ error: 'dashboardId required' }, { status: 400 });
  }

  try {
    const { access, csrf, cookie } = await supersetLogin();
    const rls = buildRlsClauses(roles, session.locationInfo);

    const guestRes = await fetch(`${SUPERSET_URL}/api/v1/security/guest_token/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${access}`,
        'X-CSRFToken': csrf,
        Cookie: cookie,
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
    console.error('Guest token route error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
