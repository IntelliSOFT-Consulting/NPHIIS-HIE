import { randomInt } from 'crypto';
import nodemailer from 'nodemailer';
import { findKeycloakUser, getKeycloakUserById, updateUserProfile } from './keycloak';
import {
    emailAttachments,
    emailFooterCopyrightHtml,
    emailFooterCopyrightText,
    emailHeaderHtml,
} from './email-branding';

const SMTP_HOST = process.env['SMTP_HOST'];
const SMTP_USERNAME = process.env['SMTP_USERNAME'];
const SMTP_PASSWORD = process.env['SMTP_PASSWORD'];
const SMTP_PORT = process.env['SMTP_PORT'] ?? "465";
const SMTP_SECURE = process.env['SMTP_SECURE'];


// SMTP Configuration
const smtpConfig = {
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT),
    secure: SMTP_SECURE === "true",
    auth: { user: SMTP_USERNAME, pass: SMTP_PASSWORD }
};


// 8-digit password-reset code from a cryptographically secure source.
function generateResetCode() {
    return randomInt(0, 100_000_000).toString().padStart(8, '0');
}

const transporter = nodemailer.createTransport(smtpConfig);

export const sendPasswordResetEmail = async (idNumber: string) => {
    try {
        const resetCode = generateResetCode();
        let userData = await findKeycloakUser(idNumber);
        
        // Validate that user exists
        if (!userData || !userData.id) {
            console.error(`User not found for ID number: ${idNumber}`);
            throw new Error('User not found');
        }
        
        let resetCodeResp = await updateUserProfile(idNumber, userData.attributes?.phone?.[0], userData.email, resetCode, null);

        // Verify reset code was stored successfully before sending email
        if (!resetCodeResp) {
            console.error(`Failed to store reset code for user: ${idNumber}`);
            throw new Error('Failed to store reset code');
        }
        
        let userInfo = await getKeycloakUserById(userData.id);
        
        // Validate that user info and email exist
        if (!userInfo || !userInfo.email) {
            console.error(`No email address found for user: ${idNumber}`);
            throw new Error('No email address found for user');
        }
        
        const mailOptions = {
            from: '"NPHIIS" apps@intellisoftkenya.com',
            to: userInfo.email,
            subject: 'NPHIIS Password Reset Code',
            html: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NPHIIS Password Reset Code</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background-color: #f4f7f9;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        .email-wrapper {
            width: 100%;
            background-color: #f4f7f9;
            padding: 20px 0;
        }
        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        }
        .content {
            padding: 40px 30px;
        }
        .greeting {
            color: #333;
            font-size: 16px;
            margin-bottom: 20px;
            line-height: 1.6;
        }
        .reset-code-box {
            background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
            border: 2px solid #3b82f6;
            border-radius: 12px;
            padding: 30px;
            text-align: center;
            margin: 30px 0;
        }
        .reset-code-label {
            margin: 0 0 10px;
            color: #2563eb;
            font-size: 14px;
            font-weight: 600;
            letter-spacing: 1px;
        }
        .reset-code {
            margin: 0;
            font-size: 48px;
            font-weight: bold;
            color: #2563eb;
            letter-spacing: 8px;
            font-family: 'Courier New', monospace;
        }
        .expiry-notice {
            margin: 10px 0 0;
            color: #666;
            font-size: 12px;
        }
        .security-tips {
            background-color: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px 20px;
            border-radius: 4px;
            margin: 30px 0;
        }
        .security-tips h3 {
            margin: 0 0 10px;
            color: #856404;
            font-size: 16px;
            font-weight: 600;
        }
        .security-tips ul {
            margin: 0;
            padding-left: 20px;
            color: #856404;
            line-height: 1.8;
        }
        .help-section {
            background-color: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin: 30px 0;
            text-align: center;
        }
        .help-section h3 {
            margin: 0 0 10px;
            color: #333;
            font-size: 16px;
        }
        .help-section p {
            margin: 5px 0;
            color: #666;
            font-size: 14px;
        }
        .footer {
            background-color: #f8f9fa;
            padding: 30px;
            text-align: center;
            border-top: 1px solid #e0e0e0;
        }
        .footer-title {
            color: #2563eb;
            font-weight: 700;
            font-size: 16px;
            margin: 0 0 10px;
        }
        .footer-contact {
            color: #666;
            font-size: 13px;
            line-height: 1.8;
            margin: 10px 0;
        }
        .footer-copyright {
            color: #999;
            font-size: 11px;
            margin: 15px 0 0;
            padding-top: 15px;
            border-top: 1px solid #e0e0e0;
        }
    </style>
</head>
<body>
    <div class="email-wrapper">
        <div class="email-container">
            ${emailHeaderHtml()}

            <!-- Content -->
            <div class="content">
                <div class="greeting">
                    <p>Hello,</p>
                    <p>We received a request to reset your NPHIIS account password. Use the code below to complete your password reset:</p>
                </div>

                <!-- Reset Code Box -->
                <div class="reset-code-box">
                    <p class="reset-code-label">YOUR PASSWORD RESET CODE</p>
                    <p class="reset-code">${resetCode}</p>
                    <p class="expiry-notice">⏱ Valid for 30 minutes</p>
                </div>

                <!-- Security Tips -->
                <div class="security-tips">
                    <h3>🔒 Security Tips</h3>
                    <ul>
                        <li>Never share this code with anyone</li>
                        <li>NPHIIS staff will never ask for your password or reset code</li>
                        <li>If you didn't request this reset, please contact support immediately</li>
                    </ul>
                </div>

                <!-- Help Section -->
                <div class="help-section">
                    <h3>Need Help?</h3>
                    <p><strong>Ministry of Health, Kenya</strong></p>
                    <p>📞 Tel: +254 718 777 000</p>
                    <p>📧 Email: dev@intellisoftkenya.com</p>
                </div>
            </div>

            <!-- Footer -->
            <div class="footer">
                <p class="footer-title">Ministry of Health, Kenya</p>
                <div class="footer-contact">
                    Tel: +254 718 777 000 | Email: dev@intellisoftkenya.com
                </div>
                <p class="footer-copyright">
                    ${emailFooterCopyrightHtml()}
                </p>
            </div>
        </div>
    </div>
</body>
</html>
                `,
            attachments: emailAttachments(),
        };
        const info = await transporter.sendMail(mailOptions);
        console.log('Password reset email sent:', info.response);
        return true;
    }
    catch (error) {
        console.error(error)
        return null
    }
}


export const sendRegistrationConfirmationEmail = async (email: string, password: string, idNumber: string = '') => {
    try {
        // const resetCode = generateResetCode();
        // let userData = await findKeycloakUser(idNumber);
        // let resetCodeResp = updateUserProfile(idNumber, null, null, resetCode);
        // console.log(userData)
        const mailOptions = {
            from: '"NPHIIS" apps@intellisoftkenya.com',
            to: email,
            subject: 'Welcome to NPHIIS - Download the App!',
            html: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to NPHIIS</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background-color: #f4f7f9;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        .email-wrapper {
            width: 100%;
            background-color: #f4f7f9;
            padding: 20px 0;
        }
        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        }
        .content {
            padding: 40px 30px;
        }
        .welcome-message {
            text-align: center;
            margin-bottom: 30px;
        }
        .welcome-message h2 {
            color: #2563eb;
            font-size: 24px;
            margin: 0 0 10px;
        }
        .welcome-message p {
            color: #666;
            font-size: 16px;
            line-height: 1.6;
            margin: 0;
        }
        .credentials-section {
            margin: 30px 0;
        }
        .credentials-section h3 {
            color: #333;
            font-size: 18px;
            margin: 0 0 15px;
            font-weight: 600;
        }
        .credentials-box {
            background: #f8f9fa;
            border-left: 4px solid #2563eb;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .credential-item {
            margin-bottom: 15px;
        }
        .credential-item:last-child {
            margin-bottom: 0;
        }
        .credential-label {
            margin: 0 0 5px;
            color: #666;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .credential-value {
            margin: 0;
            font-size: 20px;
            font-weight: bold;
            color: #000;
            font-family: 'Courier New', monospace;
            word-break: break-all;
        }
        .download-section {
            text-align: center;
            margin: 40px 0;
        }
        .download-section h3 {
            color: #333;
            font-size: 20px;
            margin: 0 0 20px;
            font-weight: 600;
        }
        .download-btn {
            display: inline-block;
            padding: 16px 40px;
            background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
            color: white !important;
            text-decoration: none;
            border-radius: 10px;
            font-weight: 600;
            font-size: 18px;
            box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
            transition: transform 0.2s;
        }
        .download-btn:hover {
            transform: translateY(-2px);
        }
        .download-note {
            margin: 15px 0 0;
            color: #666;
            font-size: 14px;
        }
        .steps-section {
            background: #eff6ff;
            border-radius: 8px;
            padding: 25px;
            margin: 30px 0;
        }
        .steps-section h3 {
            color: #2563eb;
            margin: 0 0 15px;
            font-size: 18px;
            font-weight: 600;
        }
        .steps-section ol {
            color: #333;
            line-height: 1.8;
            padding-left: 20px;
            margin: 0;
        }
        .steps-section li {
            margin-bottom: 8px;
        }
        .security-reminder {
            background-color: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px 20px;
            border-radius: 4px;
            margin: 30px 0;
        }
        .security-reminder h3 {
            margin: 0 0 10px;
            color: #856404;
            font-size: 16px;
            font-weight: 600;
        }
        .security-reminder p {
            margin: 0;
            color: #856404;
            line-height: 1.6;
        }
        .features-section {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 25px;
            margin: 30px 0;
        }
        .features-section h3 {
            color: #333;
            margin: 0 0 15px;
            font-size: 18px;
            font-weight: 600;
        }
        .features-section ul {
            color: #666;
            line-height: 1.8;
            padding-left: 20px;
            margin: 0;
        }
        .features-section li {
            margin-bottom: 8px;
        }
        .footer {
            background-color: #f8f9fa;
            padding: 30px;
            text-align: center;
            border-top: 1px solid #e0e0e0;
        }
        .footer-title {
            color: #2563eb;
            font-weight: 700;
            font-size: 16px;
            margin: 0 0 10px;
        }
        .footer-contact {
            color: #666;
            font-size: 13px;
            line-height: 1.8;
            margin: 10px 0;
        }
        .footer-copyright {
            color: #999;
            font-size: 11px;
            margin: 15px 0 0;
            padding-top: 15px;
            border-top: 1px solid #e0e0e0;
        }
    </style>
</head>
<body>
    <div class="email-wrapper">
        <div class="email-container">
            ${emailHeaderHtml()}

            <!-- Content -->
            <div class="content">
                <!-- Welcome Message -->
                <div class="welcome-message">
                    <h2>Welcome to NPHIIS! 🎉</h2>
                    <p>Your account has been successfully created. You're now part of Kenya's integrated disease surveillance and response system.</p>
                </div>

                <!-- Credentials Section -->
                <div class="credentials-section">
                    <h3>📋 Your Account Credentials</h3>
                    <div class="credentials-box">
                        <div class="credential-item">
                            <p class="credential-label">ID Number</p>
                            <p class="credential-value">${idNumber}</p>
                        </div>
                        <div class="credential-item">
                            <p class="credential-label">Temporary Password</p>
                            <p class="credential-value">${password}</p>
                        </div>
                    </div>
                </div>

                <!-- Security Reminder -->
                <div class="security-reminder">
                    <h3>🔒 Important Security Notice</h3>
                    <p>This temporary password expires in ${process.env.TEMP_PASSWORD_TTL_HOURS ?? 72} hours. If it expires, ask your administrator to resend this email. For your security, please change your password immediately after your first login. This is a best practice to ensure your account remains secure. Never share your credentials with anyone.</p>
                </div>

                <!-- Download Section -->
                <div class="download-section">
                    <h3>📱 Get Started with the NPHIIS App</h3>
                    <a href="https://play.google.com/store/apps/details?id=com.icl.nphi" class="download-btn">
                        📱 Download NPHIIS App
                    </a>
                    <p class="download-note">Available on Google Play Store</p>
                </div>

                <!-- WhatsApp Section -->
                <div class="download-section">
                    <h3>💬 Join the NPHIIS WhatsApp Group</h3>
                    <a href="https://chat.whatsapp.com/ILcW0PFsfqW0zT96nomsiD?s=sh&p=a&mlu=1" class="download-btn">
                        💬 Join WhatsApp Group
                    </a>
                    <p class="download-note">Connect with other NPHIIS users for support and updates</p>
                </div>

                <!-- What's Next Section -->
                <div class="steps-section">
                    <h3>✅ What's Next?</h3>
                    <ol>
                        <li>Download the NPHIIS app from Google Play Store using the button above</li>
                        <li>Open the app and tap "Sign In"</li>
                        <li>Enter your ID Number and temporary password</li>
                        <li>Change your password when prompted for security</li>
                        <li>Complete your profile setup</li>
                        <li>Start using NPHIIS for health surveillance and reporting</li>
                    </ol>
                </div>

                <!-- Features Section -->
                <div class="features-section">
                    <h3>🌟 Key Features</h3>
                    <ul>
                        <li>Real-time disease surveillance and reporting</li>
                        <li>Integrated Disease Surveillance and Response (IDSR)</li>
                        <li>Community and facility-level data collection</li>
                        <li>Secure data sharing with Ministry of Health</li>
                        <li>WHO SMART guidelines compliance</li>
                    </ul>
                </div>

                <!-- Help Section -->
                <div class="help-section" style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; margin-top: 30px;">
                    <h3 style="margin: 0 0 10px; color: #333; font-size: 16px;">Need Help?</h3>
                    <p style="margin: 5px 0; color: #666; font-size: 14px;"><strong>Ministry of Health, Kenya</strong></p>
                    <p style="margin: 5px 0; color: #666; font-size: 14px;">📞 Tel: +254 718 777 000</p>
                    <p style="margin: 5px 0; color: #666; font-size: 14px;">📧 Email: dev@intellisoftkenya.com</p>
                </div>
            </div>

            <!-- Footer -->
            <div class="footer">
                <p class="footer-title">Ministry of Health, Kenya</p>
                <div class="footer-contact">
                    Tel: +254 718 777 000 | Email: dev@intellisoftkenya.com
                </div>
                <p class="footer-copyright">
                    ${emailFooterCopyrightHtml()}
                </p>
            </div>
        </div>
    </div>
</body>
</html>

            `,
            attachments: emailAttachments(),
        };
        const info = await transporter.sendMail(mailOptions);
        console.log('Password reset email sent:', info.response);
        return true;
    }
    catch (error) {
        console.error(error)
        return null
    }
}
function escapeHtml(s: string): string {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Optional link target for admins (set ADMIN_PORTAL_URL in hie-auth env). */
export type CaseSubmissionEmailInput = {
    epid: string;
    diseaseCondition: string;
    countyName: string;
    subCountyName: string;
    submittedAt: Date;
    portalUrl?: string | null;
    recipientRole?: string | null;
    submittedByName: string;
    submittedByRole: string;
    submittedByFacility: string;
};

function formatEat(iso: Date): string {
    try {
        return new Intl.DateTimeFormat("en-GB", {
            timeZone: "Africa/Nairobi",
            dateStyle: "medium",
            timeStyle: "short",
        }).format(iso);
    } catch {
        return iso.toISOString();
    }
}

/**
 * Operational alert email when a new case receives an EPID (national / lab cohort).
 */
export const sendCaseSubmissionEmail = async (
    to: string,
    ctx: CaseSubmissionEmailInput,
): Promise<boolean> => {
    if (!SMTP_HOST || !SMTP_USERNAME) {
        console.warn("[Email] SMTP not configured; skipping case submission email.");
        return false;
    }

    try {
        const safeEpid = escapeHtml(ctx.epid);
        const safeDis = escapeHtml(ctx.diseaseCondition);
        const safeCounty = escapeHtml(ctx.countyName);
        const safeSub = escapeHtml(ctx.subCountyName);
        const safeSubmitter = escapeHtml(ctx.submittedByName);
        const safeSubmitterRole = escapeHtml(ctx.submittedByRole);
        const safeSubmitterFacility = escapeHtml(ctx.submittedByFacility);
        const when = escapeHtml(formatEat(ctx.submittedAt));
        const portal = ctx.portalUrl?.trim();
        const ctaHtml = portal
            ? `
                <div style="text-align:center;margin:28px 0;">
                  <a href="${escapeHtml(portal)}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#3b82f6 0%,#2563eb 100%);color:#fff;text-decoration:none;border-radius:10px;font-weight:600;">
                    Open NPHIIS admin portal
                  </a>
                </div>`
            : "";

        const roleNorm = ctx.recipientRole?.trim()?.toUpperCase() ?? "";
        const hintCopy =
            roleNorm === "LAB_TECHNICIAN"
                ? "Please verify and enter lab results using this EPID in the admin portal."
                : "Please review this case in the surveillance dashboards or admin portal as appropriate.";

        const mailOptions = {
            from: '"NPHIIS" apps@intellisoftkenya.com',
            to,
            subject: `New ${ctx.diseaseCondition} case submitted — ${ctx.epid}`,
            text: [
                `NPHIIS — New ${ctx.diseaseCondition} case submitted`,
                ``,
                `EPID: ${ctx.epid}`,
                `Disease: ${ctx.diseaseCondition}`,
                `Location: ${ctx.countyName}, ${ctx.subCountyName}`,
                `Submitted: ${formatEat(ctx.submittedAt)}`,
                `Submitted by: ${ctx.submittedByName}`,
                `Role: ${ctx.submittedByRole}`,
                `Reporting facility: ${ctx.submittedByFacility}`,
                ...(portal ? [`Portal: ${portal}`] : []),
                "",
                hintCopy,
                "",
                `${emailFooterCopyrightText()} — automated message`,
            ].join("\n"),
            html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>New ${safeDis} case submitted</title></head>
<body style="margin:0;background:#f4f7f9;font-family:'Segoe UI',Tahoma,Geneva,sans-serif;">
  <div style="padding:24px 0;background:#f4f7f9;">
    <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
      ${emailHeaderHtml()}
      <div style="padding:32px;">
        <h2 style="color:#2563eb;margin:0 0 12px;text-align:center;">New ${safeDis} case submitted</h2>
        <p style="color:#666;font-size:16px;line-height:1.6;text-align:center;margin:0;">
          A new surveillance case has been recorded and is ready for review.
        </p>
        <div style="background:#f8f9fa;border-left:4px solid #2563eb;padding:20px;border-radius:8px;margin:24px 0;">
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 0;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.5px;width:140px;">EPID</td>
                <td style="padding:8px 0;font-size:17px;font-weight:700;font-family:'Courier New',monospace;word-break:break-all;">${safeEpid}</td></tr>
            <tr><td style="padding:8px 0;color:#666;font-size:11px;text-transform:uppercase;">Disease</td>
                <td style="padding:8px 0;font-size:16px;">${safeDis}</td></tr>
            <tr><td style="padding:8px 0;color:#666;font-size:11px;text-transform:uppercase;">County</td>
                <td style="padding:8px 0;font-size:16px;">${safeCounty}</td></tr>
            <tr><td style="padding:8px 0;color:#666;font-size:11px;text-transform:uppercase;">Sub-county</td>
                <td style="padding:8px 0;font-size:16px;">${safeSub}</td></tr>
            <tr><td style="padding:8px 0;color:#666;font-size:11px;text-transform:uppercase;">Submitted</td>
                <td style="padding:8px 0;font-size:15px;color:#444;">${when} EAT</td></tr>
            <tr><td style="padding:8px 0;color:#666;font-size:11px;text-transform:uppercase;">Submitted by</td>
                <td style="padding:8px 0;font-size:16px;">${safeSubmitter}</td></tr>
            <tr><td style="padding:8px 0;color:#666;font-size:11px;text-transform:uppercase;">Role</td>
                <td style="padding:8px 0;font-size:16px;">${safeSubmitterRole}</td></tr>
            <tr><td style="padding:8px 0;color:#666;font-size:11px;text-transform:uppercase;">Reporting facility</td>
                <td style="padding:8px 0;font-size:16px;">${safeSubmitterFacility}</td></tr>
          </table>
        </div>
        ${ctaHtml}
        <p style="color:#555;font-size:14px;line-height:1.6;text-align:center;">${hintCopy}</p>
      </div>
      <div style="background:#f8f9fa;padding:22px;text-align:center;border-top:1px solid #e5e7eb;">
        <p style="margin:0;color:#2563eb;font-weight:700;font-size:15px;">Ministry of Health, Kenya</p>
        <p style="margin:8px 0 0;color:#666;font-size:13px;">Tel: +254 718 777 000 | Email: dev@intellisoftkenya.com</p>
        <p style="margin:14px 0 0;color:#999;font-size:11px;">
          ${emailFooterCopyrightHtml()}
        </p>
      </div>
    </div>
  </div>
</body>
</html>`,
            attachments: emailAttachments(),
        };

        const info = await transporter.sendMail(mailOptions);
        console.log("Case submission email:", info.response);
        return true;
    } catch (e) {
        console.error("[Email] Failed to send case submission email:", e);
        return false;
    }
};

export type LabResultEmailInput = {
    epid: string;
    diseaseCondition: string;
    labFormName: string;
    submittedAt: Date;
    portalUrl?: string | null;
    labEntererName: string;
    submittedByName: string;
    resultLines: Array<{ label: string; value: string }>;
    /** Overrides for alerts that are not a lab form, e.g. an NPHL result or specimen rejection. */
    subject?: string;
    heading?: string;
    intro?: string;
    entererLabel?: string;
};

/**
 * Alert email to the case poster when lab results are submitted for their case.
 */
export const sendLabResultEmail = async (
    to: string,
    ctx: LabResultEmailInput,
): Promise<boolean> => {
    if (!SMTP_HOST || !SMTP_USERNAME) {
        console.warn("[Email] SMTP not configured; skipping lab result email.");
        return false;
    }

    try {
        const safeEpid = escapeHtml(ctx.epid);
        const safeDis = escapeHtml(ctx.diseaseCondition);
        const safeForm = escapeHtml(ctx.labFormName);
        const safeEnterer = escapeHtml(ctx.labEntererName);
        const safeSubmitter = escapeHtml(ctx.submittedByName);
        const when = escapeHtml(formatEat(ctx.submittedAt));
        const portal = ctx.portalUrl?.trim();
        const subject = ctx.subject ?? `Lab results available — ${ctx.epid}`;
        const heading = ctx.heading ?? "Lab results available";
        const intro = ctx.intro ?? "Lab results have been recorded for a case you submitted.";
        const entererLabel = ctx.entererLabel ?? "Entered by";

        const resultRowsText = ctx.resultLines
            .map((l) => `  ${l.label}: ${l.value}`)
            .join("\n");
        const resultRowsHtml = ctx.resultLines
            .map(
                (l) =>
                    `<tr><td style="padding:8px 12px;color:#666;font-size:14px;border-bottom:1px solid #eee;">${escapeHtml(l.label)}</td>` +
                    `<td style="padding:8px 12px;font-size:14px;border-bottom:1px solid #eee;">${escapeHtml(l.value)}</td></tr>`,
            )
            .join("");

        const resultsTableHtml =
            ctx.resultLines.length > 0
                ? `<table style="width:100%;border-collapse:collapse;margin-top:8px;">${resultRowsHtml}</table>`
                : `<p style="color:#666;font-size:14px;">No result fields were available at send time.</p>`;

        const ctaHtml = portal
            ? `
                <div style="text-align:center;margin:28px 0;">
                  <a href="${escapeHtml(portal)}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#3b82f6 0%,#2563eb 100%);color:#fff;text-decoration:none;border-radius:10px;font-weight:600;">
                    Open NPHIIS admin portal
                  </a>
                </div>`
            : "";

        const mailOptions = {
            from: '"NPHIIS" apps@intellisoftkenya.com',
            to,
            subject,
            text: [
                `NPHIIS — ${heading}`,
                ``,
                intro,
                ``,
                `EPID: ${ctx.epid}`,
                `Disease: ${ctx.diseaseCondition}`,
                `Lab form: ${ctx.labFormName}`,
                `Submitted: ${formatEat(ctx.submittedAt)}`,
                `${entererLabel}: ${ctx.labEntererName}`,
                `Your case was originally submitted by: ${ctx.submittedByName}`,
                ``,
                `Results:`,
                resultRowsText || "  (none recorded)",
                ...(portal ? [``, `Portal: ${portal}`] : []),
                ``,
                `Please review the lab results in the admin portal or dashboards as appropriate.`,
                ``,
                `${emailFooterCopyrightText()} — automated message`,
            ].join("\n"),
            html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${escapeHtml(heading)} — ${safeEpid}</title></head>
<body style="margin:0;background:#f4f7f9;font-family:'Segoe UI',Tahoma,Geneva,sans-serif;">
  <div style="padding:24px 0;background:#f4f7f9;">
    <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
      ${emailHeaderHtml()}
      <div style="padding:32px;">
        <h2 style="color:#2563eb;margin:0 0 12px;text-align:center;">${escapeHtml(heading)}</h2>
        <p style="color:#666;font-size:16px;line-height:1.6;text-align:center;margin:0;">
          ${escapeHtml(intro)}
        </p>
        <div style="background:#f8f9fa;border-left:4px solid #2563eb;padding:20px;border-radius:8px;margin:24px 0;">
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 0;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.5px;width:140px;">EPID</td>
                <td style="padding:8px 0;font-size:17px;font-weight:700;font-family:'Courier New',monospace;word-break:break-all;">${safeEpid}</td></tr>
            <tr><td style="padding:8px 0;color:#666;font-size:11px;text-transform:uppercase;">Disease</td>
                <td style="padding:8px 0;font-size:16px;">${safeDis}</td></tr>
            <tr><td style="padding:8px 0;color:#666;font-size:11px;text-transform:uppercase;">Lab form</td>
                <td style="padding:8px 0;font-size:16px;">${safeForm}</td></tr>
            <tr><td style="padding:8px 0;color:#666;font-size:11px;text-transform:uppercase;">Submitted</td>
                <td style="padding:8px 0;font-size:15px;color:#444;">${when} EAT</td></tr>
            <tr><td style="padding:8px 0;color:#666;font-size:11px;text-transform:uppercase;">${escapeHtml(entererLabel)}</td>
                <td style="padding:8px 0;font-size:16px;">${safeEnterer}</td></tr>
            <tr><td style="padding:8px 0;color:#666;font-size:11px;text-transform:uppercase;">Case submitter</td>
                <td style="padding:8px 0;font-size:16px;">${safeSubmitter}</td></tr>
          </table>
        </div>
        <h3 style="color:#333;font-size:15px;margin:0 0 8px;">Lab results</h3>
        ${resultsTableHtml}
        ${ctaHtml}
        <p style="color:#555;font-size:14px;line-height:1.6;text-align:center;">Please review the lab results in the admin portal or dashboards as appropriate.</p>
      </div>
      <div style="background:#f8f9fa;padding:22px;text-align:center;border-top:1px solid #e5e7eb;">
        <p style="margin:0;color:#2563eb;font-weight:700;font-size:15px;">Ministry of Health, Kenya</p>
        <p style="margin:8px 0 0;color:#666;font-size:13px;">Tel: +254 718 777 000 | Email: dev@intellisoftkenya.com</p>
        <p style="margin:14px 0 0;color:#999;font-size:11px;">
          ${emailFooterCopyrightHtml()}
        </p>
      </div>
    </div>
  </div>
</body>
</html>`,
            attachments: emailAttachments(),
        };

        const info = await transporter.sendMail(mailOptions);
        console.log("Lab result email:", info.response);
        return true;
    } catch (e) {
        console.error("[Email] Failed to send lab result email:", e);
        return false;
    }
};
