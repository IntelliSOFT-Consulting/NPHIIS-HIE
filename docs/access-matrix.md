# NPHIIS Access Matrix

Who can do what in NPHIIS, by role. This is derived from the implementation, not from policy documents. If the code and this page disagree, the code wins and this page needs updating.

| Concern | Source of truth |
| --- | --- |
| Role list (what exists in Keycloak) | `USER_ROLES` in `hie-auth/.env` (`.env.example` has the default), served by `GET /provider/roles` |
| Role → level + permissions | `hie-auth/src/lib/permissions.ts` (`BUILT_IN_PROFILES`, `BUILT_IN_PERMISSION_PROFILES`) |
| Portal feature → permission | `nphiis-admin/src/lib/roles.ts` (`FEATURE_PERMISSION`, and `FEATURES` as the legacy role fallback) |
| Custom permission profiles | Keycloak realm roles named `PERM_<SLUG>` (`hie-auth/src/lib/permission-profiles.ts`) |

## 1. Access model

A user is assigned one **role**. A role is a **permission profile** (what the user can do) at a **level** (how much of the country the user sees).

- **Level**: `NATIONAL`, `COUNTY`, `SUB_COUNTY`, `FACILITY`. Together with the user's assigned location, the level sets the data scope.
- **Permission profile**: a named set of permissions. Built-in profiles ship in code. Administrators can create custom profiles in the admin portal. These are stored in Keycloak as `PERM_<SLUG>` roles and cannot reuse a built-in name.
- **Enforcement**: hie-auth sends the user's permissions to the portal (`GET /provider/me`). The portal decides each feature by permission. When a session carries no permission data (an older session, or a role hie-auth does not recognise), it falls back to checking role names.

## 2. Permissions

| Permission | Grants |
| --- | --- |
| `users.manage` | Create and manage users |
| `locations.manage` | Manage locations |
| `reports.idsr.view` | View IDSR case-based surveillance reports (embedded Superset) |
| `reports.vhf.view` | View VHF / Ebola dashboards |
| `rumours.triage` | Set High / Medium / Low priority on rumour reports |
| `vhf.contacts.manage` | VHF contact tracing: contact lists, daily follow-up, line-list upload |
| `evd.snapshot.submit` | Outbreak Response: submit and view the sub-county EVD Daily Snapshot (own area only; national roles see all) |
| `lab.enter_results` | Enter lab results (single and bulk upload) |
| `lab.national_scope` | See lab work from every location |
| `specimens.view` | View specimens submitted to NPHL, with status and results |
| `screenings.view` | View screened travellers (entry and exit) |
| `callcentre.use` | Use the 719 Call Centre alert log: capture, edit, delete and view calls |
| `subscriptions.logs.view` | View subscription logs |

## 3. Roles

| Role (Keycloak) | Display name | Level | Permission profile | Location |
| --- | --- | --- | --- | --- |
| `ADMINISTRATOR` | Administrator | National | Administrator | None (country-wide) |
| `SUPERUSER` | Superuser | National | Administrator | None (country-wide) |
| `NATIONAL_FOCAL_PERSON` | National Focal Person | National | Focal Person | None (country-wide) |
| `NATIONAL_VIEWER` | National Viewer | National | Viewer | None (country-wide) |
| `NATIONAL_LAB` | National Lab | National | National Lab | None (country-wide) |
| `NATIONAL_CALL_CENTER_AGENTS` | Call Centre Agent | National | Call Centre | None (country-wide) |
| `COUNTY_DISEASE_SURVEILLANCE_OFFICER` | County Disease Surveillance Officer | County | Surveillance Officer | County |
| `SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER` | Sub-County Disease Surveillance Officer | Sub-county | Surveillance Officer | Sub-county |
| `FACILITY_SURVEILLANCE_FOCAL_PERSON` | Facility Surveillance Focal Person | Facility | Facility Focal Person | Facility |
| `LAB_TECHNICIAN` | Lab Technician | Facility | Lab | Facility |
| `SUPERVISORS` | Supervisor | Facility | Field Worker | Facility |
| `VACCINATOR` | Vaccinator | Facility | Field Worker | Facility |

Roles in the first six rows are "location-free": they are registered without a location of their own and get the root (country) location.

## 4. Access matrix

Rows are roles, columns are permissions. ✅ = granted, blank = not granted.

| Role | users.manage | locations.manage | reports.idsr.view | reports.vhf.view | rumours.triage | vhf.contacts.manage | evd.snapshot.submit | lab.enter_results | lab.national_scope | specimens.view | screenings.view | callcentre.use | subscriptions.logs.view |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| `ADMINISTRATOR` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `SUPERUSER` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `NATIONAL_FOCAL_PERSON` |  |  | ✅ | ✅ | ✅ | ✅ | ✅ |  |  | ✅ | ✅ |  |  |
| `NATIONAL_VIEWER` |  |  | ✅ |  |  |  |  |  |  | ✅ | ✅ |  |  |
| `NATIONAL_LAB` |  |  |  |  |  |  |  | ✅ | ✅ | ✅ |  |  |  |
| `NATIONAL_CALL_CENTER_AGENTS` |  |  |  |  |  |  |  |  |  |  |  | ✅ |  |
| `COUNTY_DISEASE_SURVEILLANCE_OFFICER` |  |  | ✅ | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |
| `SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER` |  |  | ✅ | ✅ | ✅ | ✅ | ✅ |  |  |  |  |  |  |
| `FACILITY_SURVEILLANCE_FOCAL_PERSON` |  |  | ✅ | ✅ |  |  |  |  |  |  |  |  |  |
| `LAB_TECHNICIAN` |  |  |  |  |  |  |  | ✅ |  | ✅ |  |  |  |
| `SUPERVISORS` |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `VACCINATOR` |  |  |  |  |  |  |  |  |  |  |  |  |  |

### Same matrix by admin portal module

| Portal module | Required permission | Roles |
| --- | --- | --- |
| User management | `users.manage` | Administrator, Superuser |
| Locations | `locations.manage` | Administrator, Superuser |
| IDSR reports | `reports.idsr.view` | Administrator, Superuser, National Focal Person, National Viewer, County DSO, Sub-County DSO, Facility Focal Person |
| VHF / Ebola dashboards | `reports.vhf.view` | Administrator, Superuser, National Focal Person, County DSO, Sub-County DSO, Facility Focal Person |
| Rumour triage | `rumours.triage` | Administrator, Superuser, National Focal Person, County DSO, Sub-County DSO |
| VHF contact tracing | `vhf.contacts.manage` | Administrator, Superuser, National Focal Person, County DSO, Sub-County DSO |
| Outbreak Response: EVD Daily Snapshot | `evd.snapshot.submit` (dashboard tab also needs `reports.vhf.view`) | Administrator, Superuser, National Focal Person, County DSO, Sub-County DSO |
| Lab result entry | `lab.enter_results` | Administrator, Superuser, National Lab, Lab Technician |
| Specimen tracking | `specimens.view` | Administrator, Superuser, National Focal Person, National Viewer, National Lab, Lab Technician |
| Screened travellers | `screenings.view` | Administrator, Superuser, National Focal Person, National Viewer |
| Call Centre (719) | `callcentre.use` | Administrator, Superuser, Call Centre Agent |
| Subscription logs | `subscriptions.logs.view` | Administrator, Superuser |

`SUPERVISORS` and `VACCINATOR` have no portal permissions. They exist for the mobile app and are scoped to a facility.

## 5. Data scope (what each level sees)

Permissions say what a user can do. Level and location say where.

| Level | Roles | Scope |
| --- | --- | --- |
| National | Administrator, Superuser, National Focal Person, National Viewer, National Lab, Call Centre Agent | Whole country |
| County | County DSO | Own county |
| Sub-county | Sub-County DSO | Own sub-county |
| Facility | Facility Focal Person, Lab Technician, Supervisor, Vaccinator | Own facility |

Where scope is applied:

- **Superset dashboards**: row-level security clauses are built from the user's roles and location when the portal issues the embedded-dashboard guest token (`/api/superset/guest-token`).
- **Rumours and VHF contacts**: county and sub-county officers see only reports and contacts from their own area. National roles see everything.
- **Lab**: `lab.national_scope` (National Lab, Administrator, Superuser) shows lab work from every location. Other lab users are limited to their own.
- **Specimens, screened travellers and the call log** are not location-scoped. Access is controlled by permission alone, which is why they are limited to lab and national roles.

### Analytics patient identifiers (PII)

Line lists and chart CSV downloads in Superset (and `GET /reports/vhf/*`) hide patient identifiers for every role except **`ADMINISTRATOR`**.

| Visible to all report viewers | ADMINISTRATOR only |
| --- | --- |
| EPID / Source EPID / contact EPID, sex, age, area, clinical and lab fields | Patient name, phone, birth date, village / street / landmark, FHIR patient id, Contact ID, parent/guardian name and phone |

- **`SUPERUSER`** keeps full portal admin powers but does **not** get analytics PII.
- Chart **CSV download** is allowed for non-admins; exported rows use the same masked columns.
- **`X-Api-Key` / reports client** tokens get national row scope but **no** PII (same as a National Focal Person for geography).
- Guest embeds: ADMINISTRATOR gets a no-op RLS marker so Jinja `can_view_pii()` unmasks; everyone else stays masked.

## 6. Service-level checks (APIs)

| Endpoint / area | Who is allowed | Where |
| --- | --- | --- |
| User create, edit, delete, welcome email, notification settings, role backfill, profiles, reports (hie-auth `/provider/*`) | Administrator, Superuser (`isAdminPractitioner`) | `hie-auth/src/routes/provider-auth.ts`, `profiles.ts`, `reports.ts` |
| Subscription admin endpoints | Administrator, Superuser bearer token, or `X-Internal-Api-Key` | `hie-auth/src/middleware/internal-api-key-or-admin.ts` |
| Lab result entry (hie-auth `/lab`) | Administrator, Superuser, Lab Technician, National Lab | `ENTRY_ROLES` in `hie-auth/src/routes/lab.ts` |
| Specimen tracking (hie-auth `/lab`) | Administrator, Superuser, Lab Technician, National Lab, National Focal Person, National Viewer | `PULL_ROLES` in `hie-auth/src/routes/lab.ts` |
| Call Centre routes | `callcentre.use` | `nphiis-admin/src/lib/call-centre-auth.ts` |
| VHF contact routes | `vhf.contacts.manage` | `nphiis-admin/src/lib/contacts-auth.ts` |
| Rumours, specimens, screenings routes | `rumours.triage`, `specimens.view`, `screenings.view` | `nphiis-admin/src/app/api/*` |
| Superset guest token | `reports.idsr.view` | `nphiis-admin/src/app/api/superset/guest-token/route.ts` |

Other behaviour tied to roles:

- **Call Centre Agent only**: a user whose only role is `NATIONAL_CALL_CENTER_AGENTS` lands on `/call-centre` and sees no other module.
- **Case-submission notifications**: recipients default to `ADMINISTRATOR`, `SUPERUSER`, `LAB_TECHNICIAN` (`CASE_SUBMISSION_NOTIFY_ROLES`).
- **Lab forms**: each questionnaire in `nphiis-admin/src/lib/questionnaires.ts` lists its own allowed roles. A user with the `lab.enter_results` permission may use any lab form.

## 7. Custom roles and profiles

- Administrators can create permission profiles in the admin portal. Names must not collide with a built-in profile or role name, and permissions must come from the list in section 2.
- A custom role is a profile at a level. Clients that only know the old role names (the mobile app) receive the closest built-in role for that level as `practitionerRole`:

| Level | Compatibility role |
| --- | --- |
| National | `NATIONAL_FOCAL_PERSON` |
| County | `COUNTY_DISEASE_SURVEILLANCE_OFFICER` |
| Sub-county | `SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER` |
| Facility | `FACILITY_SURVEILLANCE_FOCAL_PERSON` |

- Any custom profile or role is outside the matrix in section 4. List them from the portal or from Keycloak (`PERM_*` realm roles).

## 8. Notes and gaps found while writing this

- **`SUPERUSER` is missing from the default `USER_ROLES`** in `hie-auth/.env.example`, although the code treats it as a full administrator. Deployments that copy the example will not have the role in Keycloak unless it is added.
- **`reports.vhf.view` vs. the Superset token**: the guest-token route checks `reports.idsr.view` only. A user with `reports.vhf.view` but not `reports.idsr.view` (possible with a custom profile) would be refused a dashboard token. Built-in roles are unaffected because every one that has the VHF permission also has the IDSR one.
- **Stale comment**: `FEATURES.VHF_REPORTS` in `nphiis-admin/src/lib/roles.ts` says National Viewers are limited to MOH 505 reports, but `NATIONAL_VIEWER` is not in that list and has no `reports.vhf.view`.
- **Unrestricted data**: specimens, screened travellers and the call log have no location filter, so granting those permissions through a custom profile gives country-wide access regardless of level.
- **Role fallback**: the legacy role-name lists in `FEATURES` duplicate the built-in profiles. They currently agree. Changing one without the other would make behaviour depend on whether the session carries permission data.

## 9. Keeping this page current

When you change access, update the code first, then this page:

1. New role: `USER_ROLES`, `BUILT_IN_PROFILES` in `permissions.ts`, and `LOCATION_FREE_ROLES` in both `hie-auth/src/lib/roles.ts` and `nphiis-admin/src/lib/roles.ts` if it is national.
2. New permission: `PERMISSIONS` in `permissions.ts`, `FEATURE_PERMISSION` and `FEATURES` in `nphiis-admin/src/lib/roles.ts`, and the profiles that should hold it.
3. Update sections 2 to 4 here.
