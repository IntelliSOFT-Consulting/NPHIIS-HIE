import { NextRequest, NextResponse } from "next/server";
import {
  forbidden,
  resolveUserRoles,
  unauthorized,
  verifyToken,
} from "@/lib/server-auth";
import { canAccess, hasAnyRole } from "@/lib/roles";
import { listCasesWithoutLabResult } from "@/lib/fhir-patient";
import { getLabForm, labResultReasons } from "@/lib/questionnaires";

// Cases of a lab form's disease that have no result for it yet, used to
// pre-fill the bulk-upload template.
export async function GET(req: NextRequest) {
  const session = await verifyToken(req);
  if (!session) return unauthorized();
  const roles = await resolveUserRoles(session);
  if (!canAccess(roles, "LAB_ACCESS")) {
    return forbidden("Lab access required");
  }

  const form = getLabForm(req.nextUrl.searchParams.get("formId") ?? "");
  if (!form) return NextResponse.json({ error: "Unknown form" }, { status: 404 });
  if (!hasAnyRole(roles, form.allowedRoles)) {
    return forbidden("Role not permitted for this form");
  }

  try {
    const pending = await listCasesWithoutLabResult(
      form.caseIdentifierSystem,
      labResultReasons(form),
      session.raw,
    );
    return NextResponse.json(pending);
  } catch (err) {
    console.error("[lab/pending-cases]", form.id, (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
