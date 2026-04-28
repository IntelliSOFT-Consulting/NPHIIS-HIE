import { NextRequest, NextResponse } from 'next/server';

// Same-origin proxy for the auth backend (`/provider/*`). The browser hits
// this Next.js route on its own origin so there's no CORS handshake; the
// route then forwards to the upstream `${API_HOST}/provider/...` server-to-
// server with all original query params, headers, and body preserved.

const API_HOST =
  process.env.API_HOST ?? process.env.NEXT_PUBLIC_API_HOST ?? '';
if (!API_HOST) {
  // Don't throw at module load — many other routes work without this — but
  // log clearly so misconfigured deploys are easy to diagnose.
  console.warn(
    '[provider-proxy] API_HOST / NEXT_PUBLIC_API_HOST not set; /api/provider requests will 502',
  );
}

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

function forwardHeaders(req: NextRequest): Headers {
  const out = new Headers();
  req.headers.forEach((v, k) => {
    if (HOP_BY_HOP.has(k.toLowerCase())) return;
    out.set(k, v);
  });
  // Mimic the auth client's default cookie so server-side session middleware
  // is satisfied even when the browser doesn't send cookies cross-origin.
  if (!out.has('cookie')) out.set('cookie', 'frontend_lang=en_US');
  return out;
}

async function proxy(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
): Promise<NextResponse> {
  if (!API_HOST) {
    return NextResponse.json(
      { error: 'Auth backend not configured' },
      { status: 502 },
    );
  }
  const { path } = await context.params;
  const search = req.nextUrl.searchParams.toString();
  const url = `${API_HOST}/provider/${path.join('/')}${search ? `?${search}` : ''}`;

  const init: RequestInit = {
    method,
    headers: forwardHeaders(req),
    cache: 'no-store',
  };
  if (method !== 'GET' && method !== 'DELETE') {
    init.body = await req.text();
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, init);
  } catch (err) {
    console.error('[provider-proxy] fetch failed:', (err as Error).message);
    return NextResponse.json(
      { error: 'Failed to reach auth backend' },
      { status: 502 },
    );
  }

  // Pass through the upstream response. Body may be JSON, text, or empty.
  const contentType = upstream.headers.get('content-type') ?? '';
  const body = await upstream.text();
  const headers = new Headers();
  if (contentType) headers.set('content-type', contentType);
  return new NextResponse(body || null, {
    status: upstream.status,
    headers,
  });
}

export const GET = (
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) => proxy(req, ctx, 'GET');
export const POST = (
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) => proxy(req, ctx, 'POST');
export const PUT = (
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) => proxy(req, ctx, 'PUT');
export const PATCH = (
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) => proxy(req, ctx, 'PATCH');
export const DELETE = (
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) => proxy(req, ctx, 'DELETE');
