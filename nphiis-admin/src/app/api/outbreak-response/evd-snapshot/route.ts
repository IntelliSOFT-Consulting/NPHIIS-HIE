import { NextRequest, NextResponse } from "next/server";
import { snapshotError, snapshotSession } from "@/lib/evd-snapshot-auth";
import { listSnapshots, reportingStatus, saveSnapshot } from "@/lib/fhir-evd-snapshot";
import { COUNT_FIELDS, isIsoDate, validateSnapshot, type LocationRef, type SnapshotInput } from "@/lib/evd-snapshot";
import { parsePaging } from "@/lib/pagination";

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max = 5000): string => (typeof v === "string" || typeof v === "number" ? String(v).slice(0, max) : "");
const locRef = (v: unknown): LocationRef | undefined =>
  isRecord(v) && typeof v.id === "string" && v.id ? { id: v.id, name: text(v.name, 200) } : undefined;

/**
 * GET: one page of snapshots (page, pageSize, date, county, subCounty), or with `view=status`
 * the sub-counties that have / have not reported for `date`.
 */
export async function GET(req: NextRequest) {
  const auth = await snapshotSession(req);
  if (auth instanceof NextResponse) return auth;
  const params = req.nextUrl.searchParams;
  const date = params.get("date") ?? "";
  if (date && !isIsoDate(date)) return NextResponse.json({ error: "date must be yyyy-mm-dd" }, { status: 400 });
  const countyId = params.get("county") || undefined;
  const subCountyId = params.get("subCounty") || undefined;
  try {
    if (params.get("view") === "status") {
      if (!date) return NextResponse.json({ error: "date is required" }, { status: 400 });
      return NextResponse.json(await reportingStatus(auth.token, auth.scope, date, countyId));
    }
    return NextResponse.json(
      await listSnapshots(auth.token, auth.scope, { ...parsePaging(params), date: date || undefined, countyId, subCountyId }),
    );
  } catch (err) {
    return snapshotError("list", err);
  }
}

/** Submit a snapshot. Saving again for the same sub-county and date replaces it. */
export async function POST(req: NextRequest) {
  const auth = await snapshotSession(req);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!isRecord(body)) return NextResponse.json({ error: "Body must be an object" }, { status: 400 });

  const rawCounts = isRecord(body.counts) ? body.counts : {};
  const input: SnapshotInput = {
    county: locRef(body.county),
    subCounty: locRef(body.subCounty),
    reportingDate: text(body.reportingDate, 10),
    focalPerson: text(body.focalPerson, 200),
    phone: text(body.phone, 30),
    email: text(body.email, 200),
    counts: Object.fromEntries(COUNT_FIELDS.map((f) => [f.id, text(rawCounts[f.id], 12)])),
    challenges: text(body.challenges, 4100),
    certified: body.certified === true,
  };
  const { errors } = validateSnapshot(input);
  if (Object.keys(errors).length) {
    return NextResponse.json({ error: "Some answers need attention", errors }, { status: 400 });
  }
  try {
    const result = await saveSnapshot(
      input,
      auth.scope,
      { practitionerId: auth.profile.practitionerId, submittedBy: auth.submittedBy },
      auth.token,
    );
    return NextResponse.json(result, { status: result.replaced ? 200 : 201 });
  } catch (err) {
    return snapshotError("save", err);
  }
}
