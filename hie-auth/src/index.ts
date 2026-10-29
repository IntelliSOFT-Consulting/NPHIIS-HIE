import express from "express";
import cors from 'cors'
import * as dotenv from 'dotenv'
import { authIpLimiter, loginLimiter, resetLimiter } from './lib/rate-limit'

dotenv.config() // Load environment variables

//Import routes
import ClientAuth from './routes/client-auth'
import ProviderAuth from './routes/provider-auth'
import Screenings from './routes/screenings'
import Profiles from './routes/profiles'
import Contacts from './routes/contacts'
import Reports from './routes/reports'
import VhfLineLists from './routes/vhf-line-lists'
import Notifications from './routes/notifications'
import Subscriptions from './routes/subscriptions'
import PatientActivity from './routes/patient-activity'
import FHIRProxy from './routes/fhir-proxy'
import Lab from './routes/lab'
import { createFHIRSubscription } from './lib/fhir-subscriptions'

import './lib/schedule'

const app = express();
const PORT = 3000;

// Behind nginx (and the admin portal's proxy), so read the client IP from X-Forwarded-For.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));

// Browsers may only call this API from the listed origins (comma-separated).
// Server-to-server and mobile requests send no Origin header and are unaffected.
const corsOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
  .split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors({ origin: corsOrigins.length ? corsOrigins : false }))

// Throttle login, registration, token refresh and password reset.
const authPaths = [
  '/client/login', '/client/register', '/client/reset-password',
  '/provider/login', '/provider/register', '/provider/refresh_token', '/provider/reset-password',
];
app.use(authPaths, authIpLimiter);
app.use(['/client/login', '/provider/login'], express.json(), loginLimiter);
app.use(['/client/reset-password', '/provider/reset-password'], express.json(), resetLimiter);

app.use((req, res, next) => {
  try {
    // Starts when a new request is received by the server
    console.log(`${new Date().toUTCString()} : The Auth Service has received ${req.method} request from ${req.hostname} on ${req.path}`);
    next()
  } catch (error) {
    // Starts when a new request is received by the server
    res.json(error);
    return;
  }
});

app.use('/client', ClientAuth)
app.use('/provider/screenings', Screenings)
app.use('/provider/profiles', Profiles)
app.use('/provider/contacts', Contacts)
app.use('/provider', ProviderAuth)
app.use('/reports/vhf', VhfLineLists)
app.use('/reports', Reports)
app.use('/notifications', Notifications)
app.use('/subscriptions/patient-activity', PatientActivity)
app.use('/subscriptions', Subscriptions)
app.use('/lab', Lab)
app.use('/fhir', FHIRProxy)

app.listen(PORT, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${PORT}`);
  createFHIRSubscription().catch((e) => console.error('FHIR subscription setup failed:', e));
});
