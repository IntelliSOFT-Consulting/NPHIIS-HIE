# How to Verify Location Info in Flask g Object

This guide shows you how to verify that location information is being extracted from the auth service and stored in Flask's `g.user_location_info` object.

## Method 1: Check Application Logs During Login

The easiest way to verify is to check the application logs when a user logs in.

### Steps:
1. **Monitor Superset logs** while a user logs in:
   ```bash
   # If using Docker
   docker logs -f <superset-container-name> | grep -i "location"
   
   # Or check log files directly
   tail -f /path/to/superset/logs/*.log | grep -i "location"
   ```

2. **Look for these log messages**:
   - `"Extracted location info: {...}"` - Shows what location fields were extracted
   - `"Stored location info in g object for user <username>: {...}"` - Confirms storage in g object

3. **Expected log output**:
   ```
   INFO: Extracted location info: {'subCounty': 'KACHELIBA', 'subCountyName': 'KACHELIBA', 'county': '24', 'countyName': 'WEST POKOT', 'country': '0', 'countryName': 'Kenya'}
   INFO: Stored location info in g object for user username: {'subCounty': 'KACHELIBA', ...}
   ```

## Method 2: Create a Test RLS Filter

Create a Row Level Security filter that uses the location info to verify it's accessible.

### Steps:
1. **Log into Superset as an Admin user**

2. **Navigate to Security → Row Level Security** (or go to `/rowlevelsecurity/list`)

3. **Create a new RLS filter**:
   - Click "Add Filter" or "Create New"
   - **Table**: Select any table you want to test with
   - **Filter Name**: "Test Location Info"
   - **Clause**: Use this Jinja2 template:
     ```jinja2
     {% if session.user_location_info %}
     -- Location info is available:
     -- County: {{ session.user_location_info.county }}
     -- County Name: {{ session.user_location_info.countyName }}
     -- Sub County: {{ session.user_location_info.subCounty }}
     -- Sub County Name: {{ session.user_location_info.subCountyName }}
     -- Country: {{ session.user_location_info.country }}
     -- Country Name: {{ session.user_location_info.countryName }}
     
     -- Example filter (adjust based on your table structure):
     county_code = '{{ session.user_location_info.county }}'
     AND sub_county_code = '{{ session.user_location_info.subCounty }}'
     {% else %}
     -- No location info available for this user
     1=0
     {% endif %}
     ```
     
     **Important**: Use `session.user_location_info` (not `g.user_location_info`) because:
     - `g` object is request-scoped and only available during the login request
     - `session` persists across requests, making it available when RLS filters are evaluated

4. **Assign the filter to a role** that your test user has

5. **Test the filter**:
   - Log in as a user with that role
   - Create a chart or query using the table
   - The query should include the location-based filter
   - Check the generated SQL to see if location values are populated

## Method 3: Use the Debug Endpoint (Already Added)

A debug endpoint has been added to `keycloak_security_manager.py` for quick verification.

### Steps:
1. **Log into Superset** with a user account

2. **Access the debug endpoint**:
   - Visit: `http://your-superset-url/login/debug/location-info/`
   - Or: `http://your-superset-url/superset/login/debug/location-info/`
   - You should see JSON with the location info

3. **Expected response** (if location info is available):
   ```json
   {
     "user": "username",
     "user_email": "user@example.com",
     "location_info_in_g": {
       "subCounty": "KACHELIBA",
       "subCountyName": "KACHELIBA",
       "county": "24",
       "countyName": "WEST POKOT",
       "country": "0",
       "countryName": "Kenya"
     },
     "location_info_in_session": {
       "subCounty": "KACHELIBA",
       "subCountyName": "KACHELIBA",
       "county": "24",
       "countyName": "WEST POKOT",
       "country": "0",
       "countryName": "Kenya"
     },
     "has_location_info_in_g": true,
     "has_location_info_in_session": true,
     "location_info_keys_g": ["subCounty", "subCountyName", "county", "countyName", "country", "countryName"],
     "location_info_keys_session": ["subCounty", "subCountyName", "county", "countyName", "country", "countryName"]
   }
   ```

4. **Note**: Location info is stored in both `g` object (request-scoped) and `session` (persists across requests). For RLS filters, use `session.user_location_info` to access the location data.

5. **Remove the debug endpoint** after verification for security (it's already in the code, just comment it out)

## Method 4: Check in SQL Lab Query

Test if location info is accessible in SQL Lab queries with RLS.

### Steps:
1. **Create an RLS filter** (as in Method 2) for a table

2. **Log in as a user** with the role that has the RLS filter

3. **Go to SQL Lab** and create a query:
   ```sql
   SELECT * FROM your_table
   ```

4. **Check the generated SQL** - it should include the location-based WHERE clause with actual values

5. **Run the query** - it should filter results based on the user's location

## Method 5: Add Logging to RLS Filter Evaluation

Check if location info is available when RLS filters are evaluated.

### Steps:
1. **Check Superset logs** when running queries:
   ```bash
   tail -f /path/to/superset/logs/*.log | grep -E "(RLS|location|g\.user)"
   ```

2. **Look for RLS filter evaluation** - the filters should be applied with location values

## Expected Behavior

### ✅ Success Indicators:
- Logs show location info being extracted during login
- Logs show location info being stored in g object
- RLS filters with location info work correctly
- SQL queries include location-based WHERE clauses with actual values
- Users only see data for their location

### ❌ Failure Indicators:
- Logs show "No locationInfo found in auth service response"
- Logs show "No location fields found in locationInfo"
- RLS filters show empty/null values
- All users see all data (RLS not working)

## Troubleshooting

### If location info is not being extracted:
1. **Check auth service response**: Verify the `/provider/me` endpoint returns `user.locationInfo`
2. **Check logs**: Look for errors in the auth service call
3. **Verify token**: Ensure the access token is valid

### If location info is extracted but not in g object:
1. **Check timing**: Location info must be stored before `login_user()` is called
2. **Check Flask context**: Ensure you're in a request context
3. **Check logs**: Look for the "Stored location info" message

### If RLS filters don't see location info:
1. **Check g object availability**: RLS filters are evaluated in a different context
2. **Verify filter syntax**: Ensure Jinja2 template syntax is correct
3. **Check role assignment**: Ensure the user has the role with the RLS filter

## Quick Test Script

You can also add this temporary test in the login method to verify:

```python
# Add after storing location info (line ~217 or ~257)
if hasattr(g, 'user_location_info'):
    logger.info(f"VERIFICATION: g.user_location_info = {g.user_location_info}")
    logger.info(f"VERIFICATION: Type = {type(g.user_location_info)}")
else:
    logger.warning("VERIFICATION: g.user_location_info NOT FOUND!")
```

Then check logs during login to see the verification output.

