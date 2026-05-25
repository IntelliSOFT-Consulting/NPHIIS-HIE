# EPID (Epidemiological ID) — how it is assigned

## Short answer

EPID is **not** created implicitly by saving a Patient or Encounter in FHIR. It **is** generated when `assignEpidForEncounter` runs via the Encounter subscription, optional backfill cron, or manual endpoints—subject to preconditions and configuration. The FHIR server does not mint EPIDs by itself.

## How automatic generation happens

1. **Encounter REST-hook subscription (primary automatic path)**  
   On startup, [`src/index.ts`](../src/index.ts) calls `createFHIRSubscription()`, which registers a HAPI `Subscription` for `Encounter?` if both env vars are set: `FHIR_EPID_SUBSCRIPTION_ID` and `FHIR_ENCOUNTERS_SUBSCRIPTION_CALLBACK_URL` ([`src/lib/fhir-subscriptions.ts`](../src/lib/fhir-subscriptions.ts)). If either is missing, EPID subscription setup logs and skips—no automatic EPID path from subscriptions.

2. **Handler**  
   `PUT /subscriptions/encounters/notifications/Encounter/:id` ([`src/routes/subscriptions.ts`](../src/routes/subscriptions.ts)) loads the Encounter + Patient, skips if the Patient already has an **official** EPID (simple `Identifier.system`, or typed `Identifier.type.coding` with `system === http://hie.org/identifiers/EPID`, with `use === 'official'` — [`src/lib/epid-utils.ts`](../src/lib/epid-utils.ts)), otherwise calls `assignEpidForEncounter`.

3. **What `assignEpidForEncounter` does** ([`src/lib/epid-assignment.ts`](../src/lib/epid-assignment.ts))  
   - **Skip**: Patient already has official EPID → no new ID.  
   - **Sync (not generate)**: Encounter already carries an EPID identifier → copy to Patient.  
   - **Generate**: Builds `formattedId` from reason code, location chain (Observation `a3-sub-county` → Location hierarchy → country/county/subcounty names), year (from Patient `system-creation` identifier, else fallbacks), and `generateCaseId` ([`src/lib/caseIdTracker.ts`](../src/lib/caseIdTracker.ts)) → then PUT Patient + PUT Encounter with the new identifier.

4. **Optional cron backfill**  
   [`src/lib/schedule.ts`](../src/lib/schedule.ts) runs `runEncounterBackfillJob()` only when `ENCOUNTER_BACKFILL_CRON_ENABLED === 'true'`. Same assignment logic as above.

5. **Manual**  
   `POST /subscriptions/encounters/assign-ids` and `POST /subscriptions/encounters/retry-epid` (internal API key) also invoke the same logic.

## When it will not be generated automatically

- Subscription env vars unset → no EPID subscription → no automatic generation on Encounter events.  
- Patient already has **official** EPID → skipped.  
- If the generate path runs but location/Observation/FHIR calls fail, `assignEpidForEncounter` returns **error** (no successful EPID).  
- Creating resources without triggering the subscription callback (or manual/backfill paths) → no EPID unless another path runs.

## Flow (high level)

```mermaid
flowchart LR
  subgraph triggers [Triggers]
    Sub[HAPI Encounter Subscription]
    Cron[Optional backfill cron]
    Manual[assign-ids / retry-epid]
  end
  subgraph hieauth [hie-auth]
    Route[notifications route]
    Assign[assignEpidForEncounter]
  end
  subgraph outcome [Outcome]
    Gen[Generate formatted EPID]
    Sync[Sync from Encounter]
    Skip[Skip if official EPID]
  end
  Sub --> Route --> Assign
  Cron --> Assign
  Manual --> Assign
  Assign --> Gen
  Assign --> Sync
  Assign --> Skip
```

**Conclusion:** EPID is automatically generated (or synced) when the configured subscription fires and preconditions pass; it is not guaranteed for every Encounter unless that pipeline is configured and succeeds.
