# Working Location Info Queries

Since `user_location_info()` is now working, here are the correct ways to use it:

## Method 1: Access Individual Properties (Recommended)

This is the best way to access location info in SQL:

```sql
SELECT 
    '{{ user_location_info().county }}' as county_code,
    '{{ user_location_info().countyName }}' as county_name,
    '{{ user_location_info().subCounty }}' as sub_county_code,
    '{{ user_location_info().subCountyName }}' as sub_county_name,
    '{{ user_location_info().country }}' as country_code,
    '{{ user_location_info().countryName }}' as country_name,
    '{{ user_location_info().ward }}' as ward_code,
    '{{ user_location_info().wardName }}' as ward_name,
    '{{ user_location_info().facility }}' as facility_code,
    '{{ user_location_info().facilityName }}' as facility_name
```

**This should work!** The function returns a dict, and you access properties with `.propertyName`.

## Method 2: Using .get() Method (Alternative)

If direct property access doesn't work for some reason:

```sql
SELECT 
    '{{ user_location_info().get("county", "") }}' as county_code,
    '{{ user_location_info().get("countyName", "") }}' as county_name,
    '{{ user_location_info().get("subCounty", "") }}' as sub_county_code,
    '{{ user_location_info().get("subCountyName", "") }}' as sub_county_name
```

## Method 3: Display as JSON String

If you want to see the entire location info as JSON:

```sql
SELECT 
    '{{ user_location_info() | tojson }}' as location_info_json
```

**Important:** Use `| tojson` filter to convert the dict to a proper JSON string.

## Method 4: Using in WHERE Clauses (RLS Filters)

Use in WHERE clauses for filtering:

```sql
SELECT *
FROM your_table
WHERE county_code = '{{ user_location_info().county }}'
  AND sub_county_code = '{{ user_location_info().subCounty }}'
```

## Method 5: With Conditional Logic

Handle cases where location info might be empty:

```sql
SELECT 
    {% if user_location_info().county %}
        '{{ user_location_info().countyName }}' as county_name
    {% else %}
        'No location assigned' as county_name
    {% endif %}
```

## Notes

- The function returns a dictionary, so use `.propertyName` to access values
- Always wrap the result in SQL string quotes: `'{{ ... }}'`
- Use `| tojson` if you want to display the entire dict as JSON
- Empty values will be empty strings `''`, not `NULL`
- The function safely returns `{}` if there's no location info

## Your Query Should Work Now!

Try Method 1 above - it should work correctly now that the function is registered and template processing is enabled.
