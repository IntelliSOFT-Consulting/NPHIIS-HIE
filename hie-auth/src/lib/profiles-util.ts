/** Upper-case key from a display name: "County Epi Logistician (CEPI)" -> COUNTY_EPI_LOGISTICIAN_CEPI. */
export function slugify(name: string): string {
    return name
        .normalize("NFKD")
        .replace(/[^\w\s-]/g, "")
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_");
}
