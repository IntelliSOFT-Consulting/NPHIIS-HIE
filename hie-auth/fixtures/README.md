# FHIR test fixtures

## Mpox case submission bundle

**File:** [mpox-case-submission-bundle.json](mpox-case-submission-bundle.json)  
**Generator:** [../scripts/build-mpox-case-submission-bundle.py](../scripts/build-mpox-case-submission-bundle.py)

Transaction bundle shaped like recent cases on [dsrfhir Encounter search](https://dsrfhir.intellisoftkenya.com/hapi/fhir/Encounter?_sort=-_lastUpdated):

- `Patient` — `system-creation` + `mpox-register` identifiers, **no** official EPID
- `Encounter` — `Mpox Register` + `case-information` reason codes
- `Observation` — demographics + `a3-sub-county` / `a4-county` (required for EPID: location chain `IGEMBE CENTRAL` → `MERU` → `Kenya`)

### Regenerate and submit

```bash
cd hie-auth/scripts
python3 build-mpox-case-submission-bundle.py > ../fixtures/mpox-case-submission-bundle.json
python3 build-mpox-case-submission-bundle.py --post --family "YourTestName"
```

After POST, HAPI calls `hie-auth` `PUT /subscriptions/encounters/notifications/Encounter/{id}` → EPID assignment → case-submission email/FCM (if SMTP and Keycloak recipients are configured).

### Last test run (2026-05-28)

| Resource   | ID |
|------------|-----|
| Patient    | `e61b0610-6484-4fdc-98f1-20a32d85d1b0` |
| Encounter  | `824b675a-5ca4-4db7-a70e-f2aade49c42c` |
| EPID       | `KEN-MER-IGE-2026-MPO-002` |

Subscription and EPID assignment succeeded. Email was skipped: no Keycloak users with `CASE_SUBMISSION_NOTIFY_ROLES` (`NATIONAL_FOCAL_PERSON`, `NATIONAL_VIEWER`, `NATIONAL_LAB`, `LAB_TECHNICIAN`).
