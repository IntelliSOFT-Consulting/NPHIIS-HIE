import fs from "fs";
import path from "path";

export const NPHIIS_NAME = "NPHIIS";
export const NPHIIS_TAGLINE =
  "National Public Health Intelligence Information System";
export const EMAIL_HEADER_CID = "nphiis-email-header";

const BANNER_FILENAME = "email-header-banner.png";

function resolveBannerPath(): string | null {
  const candidates = [
    path.join(__dirname, "../../assets", BANNER_FILENAME),
    path.join(process.cwd(), "assets", BANNER_FILENAME),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  console.warn(
    `[Email] Banner asset not found (tried: ${candidates.join(", ")}); emails will use text-only header`,
  );
  return null;
}

export function getEmailHeaderAttachment():
  | {
      filename: string;
      path: string;
      cid: string;
    }
  | null {
  const bannerPath = resolveBannerPath();
  if (!bannerPath) return null;
  return {
    filename: BANNER_FILENAME,
    path: bannerPath,
    cid: EMAIL_HEADER_CID,
  };
}

export function emailAttachments(): NonNullable<ReturnType<typeof getEmailHeaderAttachment>>[] {
  const attachment = getEmailHeaderAttachment();
  return attachment ? [attachment] : [];
}

/** Shared email header: MoH + NPHI banner (when attached) + NPHIIS title + tagline. */
export function emailHeaderHtml(): string {
  const attachment = getEmailHeaderAttachment();
  const bannerImg = attachment
    ? `<img src="cid:${EMAIL_HEADER_CID}" alt="Ministry of Health and Kenya National Public Health Institute" style="max-width:520px;width:100%;height:auto;display:block;margin:0 auto;" />`
    : "";

  return `
<div class="header" style="background:#fff;padding:24px 20px;text-align:center;border-bottom:1px solid #e5e7eb;">
  ${bannerImg}
  <h1 style="margin:16px 0 4px;font-size:22px;font-weight:700;color:#1e40af;letter-spacing:0.5px;">${NPHIIS_NAME}</h1>
  <p style="margin:0;font-size:13px;color:#475569;line-height:1.4;">${NPHIIS_TAGLINE}</p>
</div>`;
}

export function emailFooterCopyrightHtml(): string {
  return `© 2026 ${NPHIIS_TAGLINE}<br>This is an automated message. Please do not reply to this email.`;
}

export function emailFooterCopyrightText(): string {
  return `© ${NPHIIS_NAME} — ${NPHIIS_TAGLINE}`;
}
