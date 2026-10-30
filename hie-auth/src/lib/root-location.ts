import { FhirApi } from "./utils";

export interface RootLocation {
    id: string;
    name: string;
}

/** Used only when the FHIR server has no country Location at all. */
const FALLBACK: RootLocation = { id: "0", name: "Kenya" };
const TTL_MS = 5 * 60_000;
let cache: { at: number; value: RootLocation } | null = null;

/** The root of the location tree: the COUNTRY Location that is part of nothing. */
export function pickRoot(bundle: any): RootLocation | null {
    const roots = (bundle?.entry ?? [])
        .map((e: any) => e.resource)
        .filter((r: any) => r?.resourceType === "Location" && !r.partOf?.reference);
    return roots.length ? { id: String(roots[0].id), name: String(roots[0].name ?? FALLBACK.name) } : null;
}

export async function getRootLocation(): Promise<RootLocation> {
    if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
    try {
        const resp = await FhirApi({ url: "/Location?type:code=COUNTRY&_count=20" });
        const root = resp.status === "success" ? pickRoot(resp.data) : null;
        if (root) {
            cache = { at: Date.now(), value: root };
            return root;
        }
    } catch (error) {
        console.warn("[root-location] lookup failed:", (error as Error).message);
    }
    return cache?.value ?? FALLBACK;
}
