import nodemailer from 'nodemailer';
import { findKeycloakUser, updateUserProfile } from './keycloak';

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
        let resetCodeResp = updateUserProfile(idNumber, null, null, resetCode);
        // console.log(userData)
        const mailOptions = {
            from: '"ChanjoKE" apps@intellisoftkenya.com',
            to: userData.email,
            subject: 'Password Reset',
            html: `
                <p>Hello,</p>
                <p>Your reset code is: <strong>${resetCode}</strong></p>
                <p>Please use this code to reset your password.</p>
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
  