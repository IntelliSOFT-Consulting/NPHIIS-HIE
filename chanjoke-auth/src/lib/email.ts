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
        let resetCodeResp = updateUserProfile(idNumber, null, null, resetCode, null);
        // console.log(userData)
        const mailOptions = {
            from: '"OpenChanjo" apps@intellisoftkenya.com',
            to: userData.email,
            subject: 'Password Reset',
            html: `
                <!DOCTYPE html>
<html lang="en" style="margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Reset Code</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: white;
            border-radius: 5px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }
        h1 {
            color: #007bff;
            margin-top: 0;
        }
        p {
            line-height: 1.5;
            margin-bottom: 20px;
        }
        strong {
            font-weight: bold;
            color: #007bff;
            font-size: 18px;
        }
        .btn {
            display: inline-block;
            padding: 10px 20px;
            background-color: #007bff;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            transition: background-color 0.3s ease;
        }
        .btn:hover {
            background-color: #0056b3;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Password Reset Code</h1>
        <p>Hello,</p>
        <p>Your reset code is: <strong>${resetCode}</strong></p>
        <p>Please use this code to reset your password.</p>

        
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


export const sendRegistrationConfirmationEmail = async (email: string, password: string) => {
    try {
        // const resetCode = generateResetCode();
        // let userData = await findKeycloakUser(idNumber);
        // let resetCodeResp = updateUserProfile(idNumber, null, null, resetCode);
        // console.log(userData)
        const mailOptions = {
            from: '"OpenChanjo" apps@intellisoftkenya.com',
            to: email,
            subject: 'Welcome to OpenChanjo !',
            html: `
                <!DOCTYPE html>
<html lang="en" style="margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to OpenChanjo</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: white;
            border-radius: 5px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }
        h1 {
            color: #007bff;
            margin-top: 0;
        }
        p {
            line-height: 1.5;
            margin-bottom: 20px;
        }
        strong {
            font-weight: bold;
        }
        .btn {
            display: inline-block;
            padding: 10px 20px;
            background-color: #007bff;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            transition: background-color 0.3s ease;
        }
        .btn:hover {
            background-color: #0056b3;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Welcome to OpenChanjo</h1>
        <p>Hello,</p>
        <p>An account has been created for you on OpenChanjo.</p>

        <p>Please use the credentials below to get started.</p>

        <p>Email: <strong>${email}</strong></p>
        <p>Password: <strong>${password}</strong></p>

        <p>Please remember to change your password once you login.</p>
        
        <br>

        <a href="#" class="btn">Login to OpenChanjo</a>
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