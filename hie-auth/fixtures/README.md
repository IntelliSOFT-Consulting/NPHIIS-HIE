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
python3 build-mpox-case-submission-bundle.py --post --family "YourTestName" --practitioner-id "<keycloak-practitioner-uuid>"
```

---

## AFP case submission bundle

**Generator:** [../scripts/build-afp-case-submission-bundle.py](../scripts/build-afp-case-submission-bundle.py)  
**Shared library:** [../scripts/case_submission_bundle.py](../scripts/case_submission_bundle.py)

- `Patient` — `system-creation` + `afp-case-information` (value = encounter UUID)
- `Encounter` — `AFP Case Information` → EPID segment **AFP**
- `Observation` — location + Case type (`865158268604` = `Case`)

```bash
cd hie-auth/scripts
python3 build-afp-case-submission-bundle.py > ../fixtures/afp-case-submission-bundle.json
python3 build-afp-case-submission-bundle.py --post --family "AfpE2E" \
  --practitioner-id ae8df46e-4977-4413-aa90-48ee84ca772e
```

---

## Measles case submission bundle

**Generator:** [../scripts/build-measles-case-submission-bundle.py](../scripts/build-measles-case-submission-bundle.py)

- `Patient` — `measles-case-information` identifier
- `Encounter` — `Measles Case Information` → EPID segment **MEA**

```bash
python3 build-measles-case-submission-bundle.py --post --family "MeaslesE2E" \
  --practitioner-id ae8df46e-4977-4413-aa90-48ee84ca772e
```

---

## End-to-end lab result verification (AFP + Measles)

**Script:** [../scripts/verify-lab-result-workflow.sh](../scripts/verify-lab-result-workflow.sh)

Posts cases as user **909090**, enables notifications for that user, waits for EPIDs, submits lab results via nphiis-admin APIs, and checks FHIR lab Encounters, subscription callback logs, and `LAB_RESULT` notifications.

```bash
cd hie-auth/scripts
chmod +x verify-lab-result-workflow.sh
AUTH_BASE_URL=http://localhost:8443 \
ADMIN_BASE_URL=http://localhost:8080 \
FHIR_BASE_URL=http://localhost:8787/fhir \
./verify-lab-result-workflow.sh
```

After any case POST, HAPI calls `hie-auth` `PUT /subscriptions/encounters/notifications/Encounter/{id}` → EPID assignment. Lab POST triggers `LAB_RESULT` notification to the case submitter (requires `notificationsEnabled=true` on the Keycloak user; the script sets this automatically).

### Last test run (2026-06-19, AFP + Measles)

| Track | EPID | Lab Encounter |
|-------|------|---------------|
| AFP | `KEN-MER-IGC-2026-AFP-004` | `1f0fa472-8869-4d60-9cab-0a817f63ab1b` |
| Measles | `KEN-MER-IGC-2026-MEA-003` | `a35bed00-f465-4be5-8422-8d3083cc6262` |

Both tracks: verify-epid ✓, bulk-upload accepted ✓, subscription log `lab_result_notification` ✓, `LAB_RESULT` row for practitioner `ae8df46e-4977-4413-aa90-48ee84ca772e` ✓.

### Earlier run (2026-05-28, Mpox only)

| Resource   | ID |
|------------|-----|
| Patient    | `e61b0610-6484-4fdc-98f1-20a32d85d1b0` |
| Encounter  | `824b675a-5ca4-4db7-a70e-f2aade49c42c` |
| EPID       | `KEN-MER-IGE-2026-MPO-002` |

Subscription and EPID assignment succeeded. Email was skipped: no Keycloak users with `CASE_SUBMISSION_NOTIFY_ROLES` (`NATIONAL_FOCAL_PERSON`, `NATIONAL_VIEWER`, `NATIONAL_LAB`, `LAB_TECHNICIAN`).
