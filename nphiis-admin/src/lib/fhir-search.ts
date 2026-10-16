// Server-side HAPI search helpers shared by the FHIR modules.

export const FHIR_BASE_URL = (
  process.env.FHIR_BASE_URL || process.env.NEXT_PUBLIC_FHIR_BASE_URL
)?.replace(/\/$/, "");
if (!FHIR_BASE_URL) {
  throw new Error("FHIR_BASE_URL is not set");
}

const MAX_PAGES = 100;

export class FhirSearchTooLargeError extends Error {
  constructor(url: string) {
    super(`FHIR search returned more than ${MAX_PAGES} pages: ${url}`);
    this.name = "FhirSearchTooLargeError";
  }
}

interface SearchBundle<T> {
  entry?: Array<{ resource?: T; search?: { mode?: string } }>;
  link?: Array<{ relation?: string; url?: string }>;
}

export function fhirHeaders(token: string): HeadersInit {
  return {
    Accept: "application/fhir+json",
    Authorization: `Bearer ${token}`,
  };
}

/**
 * HAPI's `next` links carry its own public base URL, which this container
 * may not be able to reach, so only the paging query string is kept.
 */
function nextPageUrl<T>(bundle: SearchBundle<T>): string | undefined {
  const next = bundle.link?.find((l) => l.relation === "next")?.url;
  if (!next) return undefined;
  return `${FHIR_BASE_URL}?${new URL(next).searchParams.toString()}`;
}

/**
 * Every matching resource across all result pages. Throws rather than
 * returning a partial list when the search is too large to page through.
 */
export async function searchAll<T>(url: string, token: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | undefined = url;
  for (let page = 0; next; page++) {
    if (page === MAX_PAGES) throw new FhirSearchTooLargeError(url);
    const res = await fetch(next, { headers: fhirHeaders(token), cache: "no-store" });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`FHIR search failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const bundle = (await res.json()) as SearchBundle<T>;
    for (const e of bundle.entry ?? []) {
      if (e.resource && e.search?.mode !== "include") out.push(e.resource);
    }
    next = nextPageUrl(bundle);
  }
  return out;
}

/**
 * One page of a search plus the total match count. Sent as a POST `_search` so
 * long `_id` lists don't overflow the URL.
 */
export async function searchPage<T>(
  resourceType: string,
  params: URLSearchParams,
  token: string,
): Promise<{ resources: T[]; total: number }> {
  const res = await fetch(`${FHIR_BASE_URL}/${resourceType}/_search`, {
    method: "POST",
    headers: { ...fhirHeaders(token), "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`FHIR search failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const bundle = (await res.json()) as SearchBundle<T> & { total?: number };
  const resources = (bundle.entry ?? [])
    .filter((e) => e.resource && e.search?.mode !== "include")
    .map((e) => e.resource as T);
  return { resources, total: bundle.total ?? resources.length };
}

/**
 * Like `searchAll`, but also returns the `_include`d resources, keyed by
 * "Type/id" so callers can resolve references.
 */
export async function searchAllWithIncludes<T>(
  url: string,
  token: string,
): Promise<{ matches: T[]; included: Map<string, any> }> {
  const matches: T[] = [];
  const included = new Map<string, any>();
  let next: string | undefined = url;
  for (let page = 0; next; page++) {
    if (page === MAX_PAGES) throw new FhirSearchTooLargeError(url);
    const res = await fetch(next, { headers: fhirHeaders(token), cache: "no-store" });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`FHIR search failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const bundle = (await res.json()) as SearchBundle<any>;
    for (const e of bundle.entry ?? []) {
      if (!e.resource) continue;
      if (e.search?.mode === "include") {
        included.set(`${e.resource.resourceType}/${e.resource.id}`, e.resource);
      } else {
        matches.push(e.resource);
      }
    }
    next = nextPageUrl(bundle);
  }
  return { matches, included };
}

/** `fn` over every item, at most `limit` at a time, results in input order. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
