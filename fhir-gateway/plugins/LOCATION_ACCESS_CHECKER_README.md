# Location-Aware Access Control for FHIR Gateway

## Overview

The Location-Aware Access Control system implements hierarchical location-based
authorization for FHIR resources. It restricts access based on a practitioner's
assigned location and role, enabling jurisdiction-specific data governance in
health information systems.

## How It Works

### Architecture

1. **JWT Authentication**: Users authenticate via Keycloak, receiving a JWT with
   their Practitioner ID in the `sub` claim
2. **Practitioner Resolution**: The gateway fetches the Practitioner resource to
   extract:
   - Assigned location (from extension: `http://example.org/location`)
   - Role (from extension:
     `http://example.org/fhir/StructureDefinition/role-group`)
3. **Location Hierarchy Resolution**: Traverses the location hierarchy using
   `partOf` references
4. **Role-Based Access Scope**: Determines accessible jurisdiction levels based
   on role
5. **Resource Tagging**: Automatically tags resources with location metadata
6. **Access Enforcement**: Validates or injects location tags on all operations

### Role Hierarchy

| Role                                   | Access Level | Can Access                                                                   |
| -------------------------------------- | ------------ | ---------------------------------------------------------------------------- |
| ADMINISTRATOR                          | NATIONAL     | All locations within the country (counties, sub-counties, wards, facilities) |
| SUPERUSER                              | NATIONAL     | All locations within the country (counties, sub-counties, wards, facilities) |
| COUNTY_DISEASE_SURVEILLANCE_OFFICER    | COUNTY       | Assigned county + all sub-counties, wards, and facilities within it          |
| SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER | SUBCOUNTY    | Assigned sub-county + all wards and facilities within it                     |
| SUPERVISORS                            | SUBCOUNTY    | Assigned sub-county + all wards and facilities within it                     |
| FACILITY_SURVEILLANCE_FOCAL_PERSON     | FACILITY     | Assigned facility only                                                       |
| VACCINATOR                             | FACILITY     | Assigned facility only                                                       |

**Access Pattern**: Users see their assigned location PLUS all locations below
it in the hierarchy (children, grandchildren, etc.)

## Configuration

### Location Access Configuration

Edit `/fhir-gateway/plugins/src/main/resources/location-access-config.json`:

```json
{
  "roleHierarchy": {
    "ADMINISTRATOR": "NATIONAL",
    "SUPERUSER": "NATIONAL",
    "COUNTY_DISEASE_SURVEILLANCE_OFFICER": "COUNTY",
    "SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER": "SUBCOUNTY",
    "FACILITY_SURVEILLANCE_FOCAL_PERSON": "FACILITY",
    "SUPERVISORS": "SUBCOUNTY",
    "VACCINATOR": "FACILITY"
  },
  "locationTagSystem": "https://nphiis.go.ke/fhir/locations",
  "practitionerClaimName": "sub",
  "locationExtensionUrl": "http://example.org/location",
  "roleExtensionUrl": "http://example.org/fhir/StructureDefinition/role-group"
}
```

### Adding New Roles

To add a new role:

1. Open `location-access-config.json`
2. Add the role mapping to `roleHierarchy`:
   ```json
   "NEW_ROLE_NAME": "ACCESS_LEVEL"
   ```
   Where `ACCESS_LEVEL` is one of: `FACILITY`, `WARD`, `SUBCOUNTY`, `COUNTY`,
   `NATIONAL`
3. Save the file and restart the gateway

**No code compilation required!**

### Gateway Configuration

To enable the Location Access Checker, configure the FHIR Gateway to use the
`location` access checker:

```properties
# In your gateway configuration
access.checker=location
```

## Practitioner Resource Structure

### Required Extensions

Practitioner resources must include:

1. **Location Extension** - Assigned location reference
2. **Role Extension** - User's role

### Example Practitioner Resource

```json
{
  "resourceType": "Practitioner",
  "id": "ae8df46e-4977-4413-aa90-48ee84ca772e",
  "extension": [
    {
      "url": "http://example.org/location",
      "valueReference": {
        "reference": "Location/0",
        "display": "Kenya"
      }
    },
    {
      "url": "http://example.org/fhir/StructureDefinition/role-group",
      "valueString": "ADMINISTRATOR"
    }
  ],
  "identifier": [
    {
      "system": "http://hl7.org/fhir/administrative-identifier",
      "value": "909090"
    }
  ],
  "active": true,
  "name": [
    {
      "use": "official",
      "family": "Amolo",
      "given": ["Brian"]
    }
  ]
}
```

## Resource Tagging

### Important: Resources Are Tagged with FACILITY Locations Only

All resources MUST be tagged with **FACILITY-level** locations only (not county,
subcounty, or ward levels).

```json
{
  "resourceType": "Patient",
  "id": "example-patient",
  "meta": {
    "tag": [{
      "system": "https://nphiis.go.ke/fhir/locations",
      "code": "Location/Facility123",
      "display": "Mvita Sub-County Hospital"
    }]
  },
  ...
}
```

### How Access Validation Works

When a user tries to access a resource:

1. **Resource has tag**: `Location/Facility123`
2. **System traverses UPWARD** from Facility123:
   - Facility123 → Ward5 → SubCounty2 → County1 → National
3. **System checks**: Is the user's assigned location in this hierarchy?
4. **Examples**:
   - Ward User at Ward5: ✅ Access granted (Ward5 is in hierarchy)
   - County Admin at County1: ✅ Access granted (County1 is in hierarchy)
   - Facility User at Facility123: ✅ Access granted (direct match)
   - Facility User at Facility999: ❌ Access denied (different facility)

### Tag Injection Rules

- **Facility-level users**: System automatically injects their facility tag
- **Higher-level users** (Ward, SubCounty, County, National):
  - Cannot auto-tag (system doesn't know which facility)
  - Resource MUST already have a facility tag
  - Tag is validated against user's jurisdiction

### Tag Validation

- **POST/PUT**: Validates facility tag's hierarchy includes user's assigned
  location
- **GET (search)**: Filters results to facilities within user's jurisdiction
- **GET (read)**: Validates facility tag's hierarchy includes user's location
- **PATCH/DELETE**: Validates facility tag's hierarchy includes user's location

## Access Control Behavior

### Search Operations (GET without ID)

The gateway automatically appends location filters:

**Original Request:**

```
GET /Patient?name=John
```

**Modified Request:**

```
GET /Patient?name=John&_tag=https://nphiis.go.ke/fhir/locations|Location/123,https://nphiis.go.ke/fhir/locations|Location/456
```

### Read Operations (GET with ID)

Validates the resource has a location tag matching accessible locations.

### Create Operations (POST)

1. Parses the resource
2. Checks for existing location tags
3. If tags exist: validates at least one matches accessible locations
4. If no tags: injects primary location tag
5. Denies access if validation fails

### Update Operations (PUT/PATCH)

1. Validates existing resource is accessible
2. For PUT: validates new resource has valid location tags
3. For PATCH: maintains existing tags if accessible

### Delete Operations

Validates the resource to be deleted has accessible location tags.

### Bundle Operations

Validates each entry in the bundle according to its request method.

## Location Hierarchy

### Structure

Locations are organized hierarchically using the `partOf` reference:

```
National (Location/0)
  └── County (Location/1)
      └── Sub-County (Location/2)
          └── Ward (Location/3)
              └── Facility (Location/4)
```

### Access Examples

**Example 1: County Admin at Mombasa County (Location/1)**

- Assigned Location: `Location/1` (Mombasa County)
- Role: `COUNTY_DISEASE_SURVEILLANCE_OFFICER`
- Accessible Locations:
  - `Location/1` (Mombasa County itself)
  - `Location/2`, `Location/5`, `Location/6` (all sub-counties with partOf →
    Location/1)
  - `Location/3`, `Location/7` (all wards with partOf → any sub-county in
    Mombasa)
  - `Location/4`, `Location/8`, `Location/9` (all facilities in those wards)
- **Total**: Can access all resources tagged with any of these locations

**Example 2: Facility User at Mvita Hospital (Location/4)**

- Assigned Location: `Location/4` (Mvita Hospital)
- Role: `VACCINATOR`
- Accessible Locations:
  - `Location/4` (Mvita Hospital only)
- **Total**: Can only access resources tagged with Location/4

**Example 3: National Admin at Kenya (Location/0)**

- Assigned Location: `Location/0` (Kenya)
- Role: `ADMINISTRATOR`
- Accessible Locations:
  - ALL locations in the system (Location/0 and all its descendants)
- **Total**: Can access all resources nationwide

### Example Location Resource

```json
{
  "resourceType": "Location",
  "id": "2",
  "name": "Mvita Sub-County",
  "partOf": {
    "reference": "Location/1",
    "display": "Mombasa County"
  }
}
```

## Implementation Components

### Core Classes

1. **LocationAccessChecker** - Main access checker implementing `AccessChecker`
   interface
2. **LocationHierarchyResolver** - Resolves location hierarchies from FHIR
   server
3. **RoleBasedAccessScopeResolver** - Maps roles to access levels
4. **LocationTagMutator** - Injects and validates location tags
5. **LocationTaggingAccessDecision** - Custom decision for post-processing
6. **LocationAccessConfig** - Configuration POJO

### Factory Pattern

The `LocationAccessChecker.Factory` creates instances from JWT tokens:

```java
@Named(value = "location")
public static class Factory implements AccessCheckerFactory {
    @Override
    public AccessChecker create(DecodedJWT jwt, ...) {
        // Extract practitioner ID from JWT
        // Load configuration
        // Resolve location hierarchy
        // Create access checker
    }
}
```

## Security Considerations

1. **Default-Deny**: Access is denied by default unless explicitly validated
2. **Hierarchy Validation**: Prevents circular references with max depth limit
3. **Tag Immutability**: Users cannot bypass restrictions by manipulating tags
4. **Role Validation**: Unrecognized roles result in access denial
5. **Token Validation**: JWT must be valid and contain required claims

## Troubleshooting

### Common Issues

**1. "Role not configured" error**

- Ensure the role exists in `location-access-config.json`
- Check role spelling matches exactly (case-sensitive)

**2. "No location found for practitioner" error**

- Verify Practitioner resource has location extension at configured URL
- Check location reference format: `Location/{id}`

**3. "No role found for practitioner" error**

- Verify Practitioner resource has role extension at configured URL
- Check role value matches configured roles

**4. Resources not being filtered**

- Verify location tags are being injected (check resource metadata)
- Ensure tag system URL matches configuration

### Logging

Enable debug logging for detailed troubleshooting:

```properties
logging.level.com.google.fhir.gateway.plugin.LocationAccessChecker=DEBUG
logging.level.com.google.fhir.gateway.plugin.LocationHierarchyResolver=DEBUG
```

## Testing

### Manual Testing

1. **Test National Admin Access**:

   - Create user with ADMINISTRATOR role
   - Create resources in different locations
   - Verify user can access all resources

2. **Test Facility User Access**:

   - Create user with FACILITY_SURVEILLANCE_FOCAL_PERSON role
   - Create resources in same facility
   - Create resources in different facility
   - Verify user can only access same facility resources

3. **Test Search Filtering**:
   - Perform search without location filter
   - Verify results only include accessible locations

### Unit Testing

Refer to existing test patterns in:

- `ListAccessCheckerTest.java`
- `PatientAccessCheckerTest.java`

## Performance Considerations

1. **Location Hierarchy Caching**: Hierarchy is resolved once per request and
   cached
2. **Configuration Loading**: Configuration is loaded once at startup
3. **Tag Filtering**: Uses FHIR's native `_tag` parameter for efficient
   filtering
4. **Resource Fetching**: Minimizes server round-trips by batching when possible

## Future Enhancements

Potential improvements:

1. **Child Location Resolution**: Automatically include all child locations in
   hierarchy
2. **Multi-Location Assignment**: Support practitioners assigned to multiple
   locations
3. **Temporary Access Grants**: Time-limited access to other jurisdictions
4. **Delegation Support**: Allow supervisors to delegate access
5. **Audit Logging**: Detailed access logs for compliance

## Support

For issues or questions:

1. Check this documentation
2. Review log files for error details
3. Verify Practitioner resource structure
4. Confirm configuration is valid JSON
5. Contact the development team

## License

Copyright 2021-2023 Google LLC

Licensed under the Apache License, Version 2.0
