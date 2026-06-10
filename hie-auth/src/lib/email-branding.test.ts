import { describe, expect, it } from "vitest";
import {
  EMAIL_HEADER_CID,
  NPHIIS_NAME,
  NPHIIS_TAGLINE,
  emailFooterCopyrightHtml,
  emailFooterCopyrightText,
  emailHeaderHtml,
  getEmailHeaderAttachment,
} from "./email-branding";

describe("email-branding", () => {
  it("uses NPHIIS name and Intelligence expansion", () => {
    expect(NPHIIS_NAME).toBe("NPHIIS");
    expect(NPHIIS_TAGLINE).toBe(
      "National Public Health Intelligence Information System",
    );
  });

  it("renders header with cid when banner asset exists", () => {
    const html = emailHeaderHtml();
    expect(html).toContain(NPHIIS_NAME);
    expect(html).toContain(NPHIIS_TAGLINE);
    expect(html).not.toContain("KENYA NPHIIS");
    const attachment = getEmailHeaderAttachment();
    if (attachment) {
      expect(html).toContain(`cid:${EMAIL_HEADER_CID}`);
    }
  });

  it("renders footer copyright with new tagline", () => {
    expect(emailFooterCopyrightHtml()).toContain(NPHIIS_TAGLINE);
    expect(emailFooterCopyrightText()).toContain(NPHIIS_NAME);
    expect(emailFooterCopyrightText()).toContain(NPHIIS_TAGLINE);
  });
});
