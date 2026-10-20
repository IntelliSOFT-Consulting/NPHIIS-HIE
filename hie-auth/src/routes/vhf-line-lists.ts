import express, { NextFunction, Request, Response } from "express";
import crypto from "crypto";
import {
  validateBearerToken, validateUserAuthentication, findKeycloakUser, getClientCredentialsToken, reportsClientIds, reportsClientOf,
} from "../lib/keycloak";
import { resolvePractitionerAssignment } from "../lib/practitioner-role";
import { buildLocationInfo, FhirApi } from "../lib/utils";
import { kenyaToday } from "../lib/vhf-contact-status";
import { Dataset, fetchLineList, LineListUnavailable, PERIOD_HELP, resolvePeriod, toCsv, UserScope } from "../lib/vhf-line-lists";

/**
 * VHF line lists, the same rows as the Superset datasets (mounted at /reports/vhf):
 *
 *   GET /reports/vhf/line-list   cases and contacts, one row per VHF record ("VHF Line List")
 *   GET /reports/vhf/contacts    contacts with their 21-day follow-up ("vhf_contacts")
 *
 * Query: format=json|csv; a date range on "Date Reported" (line-list) or contact_date (contacts),
 * either period (today, yesterday, this_week, last_week, this_month, last_month, this_year,
 * last_year, last_<N>_days, yyyy, yyyy-mm, yyyy-mm-dd, yyyy-Www) or from/to (yyyy-mm-dd,
 * inclusive; Kenya dates, weeks Monday to Sunday); recordType=Case|Contact (line-list),
 * status=active|flagged|lost|completed|converted (contacts), limit (default 5000, max 50000), offset.
 *
 * Auth, one of:
 *   - a user's Keycloak bearer token: rows limited to the user's area, as in Superset;
 *   - a partner system's client credentials token from POST /reports/vhf/token, for Keycloak
 *     clients listed in REPORTS_CLIENT_IDS: all rows, and accepted on these endpoints only;
 *   - X-Api-Key = REPORTS_API_KEY: all rows.
 */
const router = express.Router();

const HIERARCHY = [
  { country: "COUNTRY" },
  { county: "COUNTY" },
  { subCounty: "SUB-COUNTY" },
  { ward: "WARD" },
  { facility: "FACILITY" },
];

function apiKeyMatches(req: Request): boolean {
  const expected = process.env.REPORTS_API_KEY?.trim();
  const provided = req.header("x-api-key");
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function userScope(username: string): Promise<UserScope | null> {
  const user = await findKeycloakUser(username);
  if (!user?.id) return null;
  const assignment = await resolvePractitionerAssignment(user.id);
  if (!assignment?.role) return { roles: [] };
  let location: UserScope["location"];
  if (assignment.locationReference) {
    const fhirLocation = (await FhirApi({ url: `/${assignment.locationReference}` })).data;
    if (fhirLocation?.type?.[0]?.coding?.[0]?.code) location = await buildLocationInfo(fhirLocation, HIERARCHY);
  }
  return { roles: [assignment.role], location };
}

async function authorize(req: Request, res: Response, next: NextFunction) {
  try {
    if (apiKeyMatches(req)) {
      (req as any).scope = { roles: ["ADMINISTRATOR"] } satisfies UserScope;
      return next();
    }
    const token = validateBearerToken(req);
    if (!token) return res.status(401).json({ status: "error", error: "Bearer token or X-Api-Key required" });
    const user = await validateUserAuthentication(token, { allowReportsClient: true });
    if (!user) return res.status(401).json({ status: "error", error: "Invalid Bearer token provided" });
    if (reportsClientOf(token, user)) {
      (req as any).scope = { roles: ["ADMINISTRATOR"] } satisfies UserScope;
      return next();
    }
    // Any other client's service account (e.g. hie-auth's own admin client) has no reports access.
    if (String(user.preferred_username ?? "").startsWith("service-account-")) {
      return res.status(403).json({ status: "error", error: "This client may not read reports" });
    }
    const scope = await userScope(user.preferred_username);
    if (!scope) return res.status(403).json({ status: "error", error: "User not found" });
    (req as any).scope = scope;
    next();
  } catch (error) {
    console.error("[VhfLineLists] auth:", error);
    return res.status(401).json({ status: "error", error: "Authentication failed" });
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
// The date that period / from / to filter on.
const DATE_FIELD: Record<Dataset, string> = { "line-list": "Date Reported", contacts: "contact_date" };
const STATUSES = ["active", "flagged", "lost", "completed", "converted"];
const MAX_LIMIT = 50000;

function handler(dataset: Dataset) {
  return async (req: Request, res: Response) => {
    const q = (k: string) => (typeof req.query[k] === "string" ? (req.query[k] as string).trim() : undefined) || undefined;
    const format = q("format") ?? "json";
    const period = q("period");
    const resolved = period ? resolvePeriod(period, kenyaToday()) : null;
    const from = resolved?.from ?? q("from");
    const to = resolved?.to ?? q("to");
    const recordType = q("recordType");
    const status = q("status");
    const limit = Number(q("limit") ?? 5000);
    const offset = Number(q("offset") ?? 0);

    const bad =
      (!["json", "csv"].includes(format) && "format must be json or csv") ||
      (period && !resolved && `period must be one of: ${PERIOD_HELP}`) ||
      (period && (q("from") || q("to")) && "use period or from/to, not both") ||
      (from && !DATE.test(from) && "from must be yyyy-mm-dd") ||
      (to && !DATE.test(to) && "to must be yyyy-mm-dd") ||
      (recordType && !["case", "contact"].includes(recordType.toLowerCase()) && "recordType must be Case or Contact") ||
      (status && !STATUSES.includes(status.toLowerCase()) && `status must be one of ${STATUSES.join(", ")}`) ||
      ((!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) && `limit must be 1-${MAX_LIMIT}`) ||
      ((!Number.isInteger(offset) || offset < 0) && "offset must be 0 or more");
    if (bad) return res.status(400).json({ status: "error", error: bad });

    try {
      const { total, rows, columns } = await fetchLineList(dataset, (req as any).scope, {
        from, to, recordType, status, limit, offset,
      });
      if (format === "csv") {
        const stamp = new Date().toISOString().slice(0, 10);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="vhf-${dataset}-${stamp}.csv"`);
        res.setHeader("X-Total-Count", String(total));
        return res.send(toCsv(columns, rows));
      }
      return res.json({
        status: "success",
        period: period ?? null, from: from ?? null, to: to ?? null, dateField: DATE_FIELD[dataset],
        total, limit, offset, count: rows.length, columns, rows,
      });
    } catch (error) {
      console.error(`[VhfLineLists] ${dataset}:`, error);
      if (error instanceof LineListUnavailable) {
        return res.status(503).json({ status: "error", error: "Line lists are not configured on this server" });
      }
      return res.status(500).json({ status: "error", error: "Could not load the line list" });
    }
  };
}

/**
 * POST /reports/vhf/token: a partner system swaps its Keycloak client id and secret for an access
 * token (client credentials grant). JSON or form body { client_id, client_secret }, or HTTP Basic.
 * Only clients in REPORTS_CLIENT_IDS; the token is accepted by the line-list endpoints only.
 */
router.post("/token", express.json(), express.urlencoded({ extended: false }), async (req: Request, res: Response) => {
  let clientId = typeof req.body?.client_id === "string" ? req.body.client_id.trim() : "";
  let clientSecret = typeof req.body?.client_secret === "string" ? req.body.client_secret : "";
  const basic = req.header("authorization")?.match(/^Basic\s+(.+)$/i);
  if (basic && !clientId) {
    const decoded = Buffer.from(basic[1], "base64").toString("utf8");
    const i = decoded.indexOf(":");
    if (i > 0) {
      try {
        clientId = decodeURIComponent(decoded.slice(0, i));
        clientSecret = decodeURIComponent(decoded.slice(i + 1));
      } catch {
        clientId = clientSecret = "";
      }
    }
  }
  if (!clientId || !clientSecret) {
    return res.status(400).json({ status: "error", error: "client_id and client_secret are required" });
  }
  // Same answer for an unlisted client as for a wrong secret.
  const invalid = () => res.status(401).json({ status: "error", error: "Invalid client credentials" });
  if (!reportsClientIds().includes(clientId)) return invalid();
  const token = await getClientCredentialsToken(clientId, clientSecret);
  if (!token) return invalid();
  return res.json({
    status: "success",
    access_token: token.access_token,
    token_type: "Bearer",
    expires_in: token.expires_in,
  });
});

router.get("/line-list", authorize, handler("line-list"));
router.get("/contacts", authorize, handler("contacts"));

export default router;
