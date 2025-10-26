# Location Access Control Algorithm - Simplified Explanation

## The Simple Truth

**Resources are tagged with FACILITY locations only.**

**Users are assigned to ANY level** (Country, County, SubCounty, Ward, or
Facility).

**Access is granted if the facility's parent at the user's level matches the
user's assigned location.**

---

## Algorithm Step-by-Step

### Step 1: Get User Context (from JWT)

```
1. Extract Practitioner ID from JWT claim "sub"
2. Fetch Practitioner resource from FHIR server
3. Extract role from extension: http://example.org/fhir/StructureDefinition/role-group
4. Extract assigned location from extension: http://example.org/location
```

### Step 2: Determine User's Access Level (from Role)

```
Role → Location Type Code (from config)

ADMINISTRATOR → COUNTRY
COUNTY_DISEASE_SURVEILLANCE_OFFICER → COUNTY
SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER → SUB-COUNTY
FACILITY_SURVEILLANCE_FOCAL_PERSON → FACILITY
```

### Step 3: Validate Resource Access

For each request to access a resource:

```
1. Get facility ID from resource's meta.tag
   Example: Location/Facility5

2. Traverse UPWARD from facility, checking each Location's type.code
   Facility5 (type: FACILITY)
     → Ward3 (type: WARD)
     → SubCounty2 (type: SUB-COUNTY) ← FOUND!
     → County1 (type: COUNTY)
     → Kenya (type: COUNTRY)

3. Find the location with type matching user's role level
   User role: SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER
   User's level type code: SUB-COUNTY
   Found location with type SUB-COUNTY: SubCounty2

4. Compare IDs
   User assigned location: SubCounty2
   Resource's parent at SUB-COUNTY level: SubCounty2
   Match? YES → Access GRANTED ✅
```

---

## Concrete Examples

### Example 1: SubCounty Officer Accessing Facility

**User:**

- Role: `SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER`
- Assigned Location: `SubCounty2` (ID from Practitioner extension)

**Resource:**

- Tag: `Location/Facility5`

**Process:**

1. User's level: `SUB-COUNTY` (from config mapping)
2. Traverse from Facility5:
   - Facility5 → type: `FACILITY` (not a match, continue)
   - Ward3 → type: `WARD` (not a match, continue)
   - SubCounty2 → type: `SUB-COUNTY` ✅ **FOUND!**
3. Compare: `SubCounty2` == `SubCounty2`?
4. Result: **YES → Access GRANTED** ✅

---

### Example 2: SubCounty Officer Accessing Different Facility

**User:**

- Role: `SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER`
- Assigned Location: `SubCounty7`

**Resource:**

- Tag: `Location/Facility5`

**Process:**

1. User's level: `SUB-COUNTY`
2. Traverse from Facility5:
   - Facility5 → type: `FACILITY` (continue) -etan3 → type: `WARD` (continue)
   - SubCounty2 → type: `SUB-COUNTY` ✅ **FOUND!**
3. Compare: `SubCounty7` == `SubCounty2`?
4. Result: **NO → Access DENIED** ❌

---

### Example 3: County Officer Accessing Facility

**User:**

- Role: `COUNTY_DISEASE_SURVEILLANCE_OFFICER`
- Assigned Location: `County1`

**Resource:**

- Tag: `Location/Facility5`

**Process:**

1. User's level: `COUNTY`
2. Traverse from Facility5:
   - Facility5 → type: `FACILITY` (continue)
   - Ward3 → type: `WARD` (continue)
   - SubCounty2 → type: `SUB-COUNTY` (continue)
   - County1 → type: `COUNTY` ✅ **FOUND!**
3. Compare: `County1` == `County1`?
4. Result: **YES → Access GRANTED** ✅

---

### Example 4: Facility User Accessing Their Facility

**User:**

- Role: `VACCINATOR`
- Assigned Location: `Facility5`

**Resource:**

- Tag: `Location/Facility5`

**Process:**

1. User's level: `FACILITY`
2. Traverse from Facility5:
   - Facility5 → type: `FACILITY` ✅ **FOUND!**
3. Compare: `Facility5` == `Facility5`?
4. Result: **YES → Access GRANTED** ✅

---

### Example 5: National Admin Accessing Any Facility

**User:**

- Role: `ADMINISTRATOR`
- Assigned Location: `Kenya` (ID: 0)

**Resource:**

- Tag: `Location/Facility999`

**Process:**

1. User's level: `COUNTRY`
2. Traverse from Facility999:
   - Facility999 → type: `FACILITY` (continue)
   - Ward50 → type: `WARD` (continue)
   - SubCounty25 → type: `SUB-COUNTY` (continue)
   - County10 → type: `COUNTY` (continue)
   - Kenya → type: `COUNTRY` ✅ **FOUND!**
3. Compare: `Kenya` (ID: 0) == `Kenya` (ID: 0)?
4. Result: **YES → Access GRANTED** ✅

---

## Key Implementation Details

### Location.type.code

Each Location resource MUST have a type.code indicating its level:

```json
{
  "resourceType": "Location",
  "id": "SubCounty2",
  "name": "Mvita Sub-County",
  "type": [
    {
      "coding": [
        {
          "code": "SUB-COUNTY"
        }
      ]
    }
  ],
  "partOf": {
    "reference": "Location/County1"
  }
}
```

### Configuration Mapping

The `location-access-config.json` maps roles to location type codes:

```json
{
  "roleHierarchy": {
    "ADMINISTRATOR": "COUNTRY",
    "COUNTY_DISEASE_SURVEILLANCE_OFFICER": "COUNTY",
    "SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER": "SUB-COUNTY",
    "FACILITY_SURVEILLANCE_FOCAL_PERSON": "FACILITY"
  }
}
```

### Why This Works

✅ **No guessing**: Uses actual FHIR Location.type metadata  
✅ **Flexible hierarchy**: Handles variable hierarchy depths  
✅ **Simple logic**: Just find matching type and compare IDs  
✅ **Efficient**: Single upward traversal per validation  
✅ **Maintainable**: Easy to understand and debug

---

## Search Query Optimization

For search operations, the system still resolves all accessible facilities:

**User:** County Officer at County1  
**Search:** `GET /Patient?name=John`

**Process:**

1. Resolve all facilities in County1 (downward traversal)
2. Create tag filter with all facility IDs
3. Modified query:
   `GET /Patient?name=John&_tag=Location/F1,Location/F2,...,Location/F50`

This ensures search results only include resources from accessible facilities.

---

## Summary

**The algorithm is beautifully simple:**

1. Extract facility from resource tag
2. Traverse up checking Location.type.code
3. Find the one matching user's role level
4. Compare that location ID to user's assigned location
5. Match = Access ✅ | No Match = Deny ❌

**No complex lists, no pre-computed hierarchies, just smart traversal!** 🎯
