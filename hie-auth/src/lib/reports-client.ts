/** Keycloak clients whose service account may read the VHF line lists (REPORTS_CLIENT_IDS, comma-separated). */
export const reportsClientIds = (): string[] =>
  (process.env.REPORTS_CLIENT_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/**
 * The reports client a token belongs to when it is that client's service account token (client
 * credentials), else null. Call only after Keycloak has accepted the token: the payload is not
 * verified here.
 */
export const reportsClientOf = (accessToken: string, userInfo: any): string | null => {
  // Keycloak names a client's service account user service-account-<client id>.
  if (!String(userInfo?.preferred_username ?? "").startsWith("service-account-")) return null;
  try {
    const claims = JSON.parse(Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString("utf8"));
    return typeof claims?.azp === "string" && reportsClientIds().includes(claims.azp) ? claims.azp : null;
  } catch {
    return null;
  }
};
