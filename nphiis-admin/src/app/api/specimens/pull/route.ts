import { NextRequest, NextResponse } from "next/server";
import {
  forbidden,
  resolveUserRoles,
  unauthorized,
  verifyToken,
} from "@/lib/server-auth";
import { canAccess } from "@/lib/roles";

const API_HOST = (process.env.API_HOST ?? process.env.NEXT_PUBLIC_API_HOST ?? "").replace(/\/$/, "");

// Asks hie-auth to pull NPHL results now rather than on its next scheduled poll.
export async function POST(req: NextRequest) {
  const session = await verifyToken(req);
  if (!session) return unauthorized();
  const roles = await resolveUserRoles(session);
  if (!canAccess(roles, "SPECIMENS_VIEW")) {
    return forbidden("Specimen tracking access required");
  }
  if (!API_HOST) {
    return NextResponse.json({ error: "Auth backend not configured" }, { status: 502 });
  }

  try {
    const res = await fetch(`${API_HOST}/lab/pull`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.raw}`, Accept: "application/json" },
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message =
        body?.issue?.[0]?.details?.text ?? body?.error ?? `hie-auth returned ${res.status}`;
      return NextResponse.json({ error: message }, { status: res.status >= 500 ? 502 : res.status });
    }
    return NextResponse.json(body);
  } catch (err) {
    console.error("[specimens/pull] failed:", (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
