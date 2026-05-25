import { NextRequest, NextResponse } from 'next/server';
import { unauthorized, verifyToken } from '@/lib/server-auth';

const FHIR_BASE_URL = process.env.FHIR_BASE_URL || process.env.NEXT_PUBLIC_FHIR_BASE_URL;
if (!FHIR_BASE_URL) {
  throw new Error('FHIR_BASE_URL is not set');
}

const base = FHIR_BASE_URL.replace(/\/$/, '');

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
): Promise<NextResponse> {
  const session = await verifyToken(request);
  if (!session) return unauthorized();

  let upstreamUrl = '';
  try {
    const { path } = await context.params;
    const search = request.nextUrl.searchParams.toString();
    upstreamUrl = `${base}/${path.join('/')}${search ? `?${search}` : ''}`;

    const init: RequestInit = {
      method,
      headers: {
        Accept: 'application/fhir+json',
        Authorization: `Bearer ${session.raw}`,
        ...(method === 'POST' || method === 'PUT'
          ? { 'Content-Type': 'application/fhir+json' }
          : {}),
      },
      cache: 'no-store',
    };

    if (method === 'POST' || method === 'PUT') {
      init.body = await request.text();
    }

    const response = await fetch(upstreamUrl, init);
    const text = await response.text();

    if (text) {
      try {
        const data = JSON.parse(text);
        return NextResponse.json(data, { status: response.status });
      } catch (parseErr) {
        console.error(
          `[fhir-proxy] Upstream returned non-JSON (status=${response.status})`,
          { upstreamUrl, bodyPreview: text.slice(0, 500), parseErr },
        );
        return NextResponse.json(
          {
            error: 'Upstream FHIR returned a non-JSON response',
            resourceType: 'OperationOutcome',
            issue: [{ severity: 'error', diagnostics: 'Expected application/fhir+json from FHIR server' }],
          },
          { status: 502 },
        );
      }
    }

    return new NextResponse(null, { status: response.status });
  } catch (error) {
    const err = error as Error & { cause?: unknown };
    const causeMsg =
      err?.cause instanceof Error ? err.cause.message : err?.cause != null ? String(err.cause) : '';
    console.error(`Error proxying ${method} to FHIR server:`, error, {
      upstreamUrl,
      cause: causeMsg || undefined,
    });
    return NextResponse.json({ error: 'Failed to connect to FHIR server' }, { status: 500 });
  }
}

export const GET = (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) =>
  proxy(req, ctx, 'GET');
export const POST = (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) =>
  proxy(req, ctx, 'POST');
export const PUT = (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) =>
  proxy(req, ctx, 'PUT');
export const DELETE = (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) =>
  proxy(req, ctx, 'DELETE');
