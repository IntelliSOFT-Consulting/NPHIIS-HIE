import nodemailer from 'nodemailer';
import { findKeycloakUser, getKeycloakUserById, updateUserProfile } from './keycloak';

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


// Function to generate a random 5-digit code
function generateResetCode() {
    return Math.floor(10000 + Math.random() * 90000).toString(); // Random 5-digit code
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
        console.log(userInfo);
        
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
        .header {
            background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%);
            padding: 30px 20px;
            text-align: center;
            color: white;
        }
        .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 700;
            letter-spacing: 1px;
        }
        .header p {
            margin: 8px 0 0 0;
            font-size: 13px;
            opacity: 0.95;
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
            <!-- Header -->
            <div class="header">
                <h1>KENYA NPHIIS</h1>
                <p>National Public Health Information & Surveillance System</p>
            </div>

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
                    © 2026 National Public Health Information & Surveillance System<br>
                    This is an automated message. Please do not reply to this email.
                </p>
            </div>
        </div>
    </div>
</body>
</html>
                `
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
        .header {
            background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%);
            padding: 30px 20px;
            text-align: center;
            color: white;
        }
        .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 700;
            letter-spacing: 1px;
        }
        .header p {
            margin: 8px 0 0 0;
            font-size: 13px;
            opacity: 0.95;
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
            <!-- Header -->
            <div class="header">
                <h1>KENYA NPHIIS</h1>
                <p>National Public Health Information & Surveillance System</p>
            </div>

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
                    <p>For your security, please change your password immediately after your first login. This is a best practice to ensure your account remains secure. Never share your credentials with anyone.</p>
                </div>

                <!-- Download Section -->
                <div class="download-section">
                    <h3>📱 Get Started with the NPHIIS App</h3>
                    <a href="https://play.google.com/store/apps/details?id=com.icl.nphi" class="download-btn">
                        📱 Download NPHIIS App
                    </a>
                    <p class="download-note">Available on Google Play Store</p>
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
                    © 2026 National Public Health Information & Surveillance System<br>
                    This is an automated message. Please do not reply to this email.
                </p>
            </div>
        </div>
    </div>
</body>
</html>

            `
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