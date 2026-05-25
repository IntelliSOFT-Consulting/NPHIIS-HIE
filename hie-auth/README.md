### EPID assignment

See [docs/EPID.md](docs/EPID.md) for when epidemiological IDs are generated (subscriptions, cron, manual endpoints) and when they are skipped.

#### Development Mode

`yarn dev`


#### Production

First ensure you build the project with tsc.

`yarn build`


Run the production build.

`yarn start`

### Case submission notifications

After a successful **new EPID generation** from the HAPI Encounter subscription, national / lab cohorts configured in Keycloak are notified via **FCM** (for users who registered `/notifications/config`) and **SMTP**.

| Variable | Purpose |
|----------|---------|
| `CASE_SUBMISSION_NOTIFY_ROLES` | Comma-separated `practitionerRole` codes. Default: `ADMINISTRATOR,SUPERUSER,LAB_TECHNICIAN`. |
| `ADMIN_PORTAL_URL` | Optional HTTPS URL for an “Open NPHIIS admin portal” button in emails. |

Case-submission retries distinguish **FCM** (`status`) from **email**: when SMTP succeeds, `caseSubmissionEmailSentAt` is set so a later retry (e.g. FCM still failing) does not send duplicate mail.

Apply DB migrations (`prisma migrate deploy`) before deploying — the `Notification` table gains `type`, composite uniqueness, optional `investigationDate` for AFP vs case-submission rows, and optional `caseSubmissionEmailSentAt` for email idempotency.
