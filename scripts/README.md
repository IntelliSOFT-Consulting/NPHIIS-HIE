# Bulk User Registration Script

This script allows you to register multiple users at once from a CSV file to the ChanjoKe HIE authentication service.

## Prerequisites

1. Python 3.6 or higher
2. Install required dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## CSV Format

The CSV file should contain the following columns:

### Required Columns:
- **First Name**: User's first name
- **LastName**: User's last name  
- **Email Address**: User's email address
- **ID Number**: User's national ID or identification number
- **Role**: User's role (e.g., ADMINISTRATOR, HEALTH_WORKER, DATA_CLERK)

### Optional Columns:
- **Phone Number**: User's phone number (will be auto-formatted for Kenya)
- **Health Facility**: Facility ID (required for non-administrator roles)

Note: The script handles duplicate column names that may appear in exported data (e.g., multiple "Email Address" or "County" columns).

## Supported Roles

The script supports the following roles:
- `ADMINISTRATOR` - System administrators (no facility required)
- `SUPERUSER` - Super users with elevated privileges (no facility required)
- `COUNTY_DISEASE_SURVEILLANCE_OFFICER` - County-level disease surveillance officers (facility required)
- `SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER` - Sub-county level disease surveillance officers (facility required)
- `FACILITY_SURVEILLANCE_FOCAL_PERSON` - Facility-level surveillance focal persons (facility required)
- `SUPERVISORS` - Supervisors (facility required)
- `VACCINATOR` - Vaccinators (facility required)

### Role Mapping from CSV

The script automatically normalizes common role variations. Your CSV can use these human-readable names:
- "National" → `ADMINISTRATOR`
- "County Disease Surveillance Officer" → `COUNTY_DISEASE_SURVEILLANCE_OFFICER`
- "Sub County Disease Surveillance Officer" → `SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER`
- "Facility Disease Surveillance Officer" → `FACILITY_SURVEILLANCE_FOCAL_PERSON`
- "Admin", "Administrator" → `ADMINISTRATOR`
- "Super User" → `SUPERUSER`
- "County DSO", "CDSO" → `COUNTY_DISEASE_SURVEILLANCE_OFFICER`
- "SubCounty DSO", "SCDSO" → `SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER`
- "Facility DSO", "Facility Focal" → `FACILITY_SURVEILLANCE_FOCAL_PERSON`
- "Supervisor" → `SUPERVISORS`
- "Nurse", "Health Worker" → `VACCINATOR`

## Usage

### Quick Start (Production Environment):
```bash
# 1. Prepare your CSV file with user data
# 2. Run a dry-run to validate the data first
python bulk_register.py your_users.csv --api-host https://auth.nphiis.nphl.go.ke --dry-run

# 3. If validation passes, run the actual registration
python bulk_register.py your_users.csv --api-host https://auth.nphiis.nphl.go.ke

# 4. Check the output files for credentials and results
ls -lt registration_*
```

### Basic Usage (with auto-generated passwords):
```bash
python bulk_register.py users.csv
```

### Dry Run (validate CSV without registering):
```bash
python bulk_register.py users.csv --dry-run
```

### Using Custom API Host:
```bash
# For production
python bulk_register.py users.csv --api-host https://auth.nphiis.nphl.go.ke

# For local development
python bulk_register.py users.csv --api-host http://localhost:3000

# For Docker environment
python bulk_register.py users.csv --api-host http://hie-auth:3000
```

### Using Default Password for All Users:
```bash
python bulk_register.py users.csv --default-password "ChangeMe123!"
```

### Custom Request Delay:
```bash
python bulk_register.py users.csv --delay 1.0
```

## Output Files

The script generates two output files after completion:

1. **registration_results_[timestamp].json** - Detailed results of all registration attempts
2. **registration_credentials_[timestamp].csv** - Username and password credentials for successfully registered users

⚠️ **IMPORTANT**: The credentials file contains plaintext passwords. Store it securely and share credentials with users through secure channels!

## Example CSV

See `sample_users.csv` for an example CSV file format.

```csv
First Name,LastName,Email Address,ID Number,Phone Number,Role,Health Facility
John,Doe,john@example.com,12345678,0712345678,Sub County Disease Surveillance Officer,40
Jane,Smith,jane@example.com,23456789,0723456789,County Disease Surveillance Officer,25
Mary,Johnson,mary@example.com,45678901,0745678901,Facility Disease Surveillance Officer,123
Admin,User,admin@example.com,34567890,0734567890,National,
```

**Note:** The Health Facility column should contain the numeric facility ID (e.g., `40`, `123`). For National/Administrator roles, leave this field empty.

## Phone Number Formatting

The script automatically formats phone numbers for Kenya:
- `0712345678` → `+254712345678`
- `712345678` → `+254712345678`
- `254712345678` → `+254712345678`
- `+254712345678` → `+254712345678` (no change)

## Error Handling

The script will:
- Skip rows with missing required fields
- Report validation errors
- Continue processing remaining users if one fails
- Generate a summary report at the end
- Save detailed error information to the results file

## Facility ID Lookup

Currently, the script expects the "Health Facility" column to contain the facility ID directly. If you need to look up facilities by name, you can modify the `get_facility_id()` method in the script to:
1. Query the FHIR API
2. Use a lookup table/CSV
3. Implement custom logic

## Troubleshooting

### Connection Errors
If you get connection errors, ensure:
1. The HIE Auth service is running
2. The API host URL is correct
3. You have network access to the service

### Authentication Errors
The `/provider/register` endpoint may require authentication in production. If so, you'll need to:
1. First authenticate to get a token
2. Include the token in the registration requests

### Validation Errors
Common validation errors:
- "facility required" - Non-administrator roles must have a facility ID
- "invalid role" - Role must be one of the allowed roles
- "user already exists" - A user with the same ID number already exists

## Security Considerations

1. **Passwords**: By default, the script generates random 12-character passwords. Store the output CSV securely.
2. **Data Privacy**: The CSV may contain PII (Personally Identifiable Information). Handle it according to data protection regulations.
3. **API Access**: Ensure the registration endpoint is properly secured in production.
4. **Audit Trail**: The registration service logs all registration attempts.

## Support

For issues or questions, please refer to the main ChanjoKe HIE documentation or contact the system administrator.

