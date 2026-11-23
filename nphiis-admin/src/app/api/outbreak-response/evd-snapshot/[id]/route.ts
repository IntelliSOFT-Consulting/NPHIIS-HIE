import { NextRequest, NextResponse } from "next/server";
import { snapshotError, snapshotSession } from "@/lib/evd-snapshot-auth";
import { getSnapshot } from "@/lib/fhir-evd-snapshot";

/** One snapshot, for viewing or editing. Outside the caller's area it is "not found". */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await snapshotSession(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    return NextResponse.json(await getSnapshot(id, auth.scope, auth.token));
  } catch (err) {
    return snapshotError("read", err);
  }
}
