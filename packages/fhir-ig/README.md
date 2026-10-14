# NPHIIS Patient Identity IG

Design-time FHIR R4 Implementation Guide for patients resolved from:

- **Client Registry (CR)** — `ClientRegistryPatient`
- **IPRS** — `IprsPatient`

## Profiles

| Profile id | Canonical URL |
| --- | --- |
| `client-registry-patient` | `http://nphiis.health.go.ke/fhir/StructureDefinition/client-registry-patient` |
| `iprs-patient` | `http://nphiis.health.go.ke/fhir/StructureDefinition/iprs-patient` |

## Build

Requires [SUSHI](https://github.com/FHIR/sushi):

```bash
cd packages/fhir-ig
npm install
npm run build
```

This IG is a design-time artifact. Runtime mapping lives in `hie-auth` (`GET /provider/patients/validate`).
