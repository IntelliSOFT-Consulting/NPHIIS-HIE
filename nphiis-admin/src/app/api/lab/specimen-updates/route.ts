import { NextRequest, NextResponse } from "next/server";
import { forbidden, resolveUserRoles, unauthorized, verifyToken } from "@/lib/server-auth";
import { canAccess } from "@/lib/roles";

const API_HOST = (process.env.API_HOST ?? process.env.NEXT_PUBLIC_API_HOST ?? "").replace(/\/$/, "");
const MAX_MESSAGES = 2000;

/**
 * Lab results entered against specimens. Body: { data: [...] } of lab API
 * messages (lib/lab-messages.ts), passed to hie-auth's POST /lab/updates, which
 * applies them as it does the lab system's POST /lab/results.
 */
export async function POST(req: NextRequest) {
  const session = await verifyToken(req);
  if (!session) return unauthorized();
  const roles = await resolveUserRoles(session);
  if (!canAccess(roles, "LAB_ACCESS")) return forbidden("Lab access required");
  if (!API_HOST) return NextResponse.json({ error: "Auth backend not configured" }, { status: 502 });

  let body: { data?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const data = Array.isArray(body?.data) ? body.data : null;
  if (!data?.length) return NextResponse.json({ error: "No updates to record" }, { status: 400 });
  if (data.length > MAX_MESSAGES) {
    return NextResponse.json({ error: `At most ${MAX_MESSAGES} rows per upload` }, { status: 400 });
  }

  try {
    const res = await fetch(`${API_HOST}/lab/updates`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.raw}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data }),
      cache: "no-store",
    });
    const out = await res.json().catch(() => ({}));
    // 400 "No usable messages" still lists why each message was refused.
    if (!res.ok && !(res.status === 400 && Array.isArray(out?.invalid))) {
      const message = out?.issue?.[0]?.details?.text ?? out?.error ?? `hie-auth returned ${res.status}`;
      return NextResponse.json({ error: message }, { status: res.status >= 500 ? 502 : res.status });
    }
    return NextResponse.json({ received: out.received ?? 0, results: out.results ?? [], invalid: out.invalid ?? [] });
  } catch (err) {
    console.error("[lab/specimen-updates] failed:", (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
