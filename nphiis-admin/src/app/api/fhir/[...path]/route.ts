import { NextRequest, NextResponse } from 'next/server';
import { unauthorized, verifyToken } from '@/lib/server-auth';

const FHIR_BASE_URL = process.env.FHIR_BASE_URL || process.env.NEXT_PUBLIC_FHIR_BASE_URL;
if (!FHIR_BASE_URL) {
  throw new Error('FHIR_BASE_URL is not set');
}

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
): Promise<NextResponse> {
  const session = await verifyToken(request);
  if (!session) return unauthorized();

  try {
    const { path } = await context.params;
    const search = request.nextUrl.searchParams.toString();
    const url = `${FHIR_BASE_URL}/${path.join('/')}${search ? `?${search}` : ''}`;

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

    const response = await fetch(url, init);
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error(`Error proxying ${method} to FHIR server:`, error);
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
