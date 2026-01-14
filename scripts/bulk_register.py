#!/usr/bin/env python3
"""
Bulk User Registration Script for ChanjoKe HIE
Reads a CSV file and registers users through the hie-auth /provider/register service
"""

import csv
import requests
import sys
import os
import argparse
import json
from typing import Dict, List, Optional
import time
from datetime import datetime
import secrets
import string
from urllib.parse import quote


class BulkRegistration:
    """Handles bulk registration of users from CSV to HIE Auth service"""
    
    def __init__(self, api_host: str = "https://auth.nphiis.health.go.ke", fhir_url: str = "https://dsrfhir.intellisoftkenya.com/hapi/fhir"):
        """
        Initialize the BulkRegistration handler
        
        Args:
            api_host: Base URL of the HIE Auth API (default: https://auth.nphiis.health.go.ke)
            fhir_url: Base URL of the FHIR API (default: https://dsrfhir.intellisoftkenya.com/hapi/fhir)
        """
        self.api_host = api_host.rstrip('/')
        self.register_url = f"{self.api_host}/provider/register"
        self.fhir_url = fhir_url.rstrip('/')
        self.success_count = 0
        self.error_count = 0
        self.errors = []
        
    def generate_password(self, length: int = 12) -> str:
        """Generate a random password"""
        chars = string.ascii_letters + string.digits + "!@#$%^&*()"
        return ''.join(secrets.choice(chars) for _ in range(length))
    
    def clean_phone(self, phone: str) -> Optional[str]:
        """
        Clean and format phone number
        
        Args:
            phone: Raw phone number from CSV
            
        Returns:
            Cleaned phone number or None if invalid
        """
        if not phone:
            return None
        
        # Convert to string and remove all whitespace, dashes, parentheses, and other separators
        phone = str(phone).strip()
        # Remove all spaces, dashes, parentheses, and other common separators
        phone = ''.join(c for c in phone if c.isdigit() or c == '+')
        
        if not phone:
            return None
        
        # Handle different formats
        if phone.startswith('+254'):
            # Already in correct format
            return phone if len(phone) == 13 else None  # +254XXXXXXXXX should be 13 chars
        elif phone.startswith('254'):
            # Has country code but no +
            return f'+{phone}' if len(phone) == 12 else None  # 254XXXXXXXXX should be 12 digits
        elif phone.startswith('0') and len(phone) == 10:
            # Kenyan format starting with 0
            return f'+254{phone[1:]}'
        elif len(phone) == 9:
            # Just the 9 digits without leading 0
            return f'+254{phone}'
        elif phone.startswith('+'):
            # Has + but might be wrong country code or format
            # Try to extract just the digits and rebuild
            digits = ''.join(c for c in phone if c.isdigit())
            if len(digits) == 12 and digits.startswith('254'):
                return f'+{digits}'
            elif len(digits) == 9:
                return f'+254{digits}'
            elif len(digits) == 10 and digits.startswith('0'):
                return f'+254{digits[1:]}'
        
        # If we can't parse it, return None
        return None
    
    def normalize_role(self, role: str) -> str:
        """
        Normalize role to expected format
        
        Args:
            role: Raw role from CSV
            
        Returns:
            Normalized role in uppercase
        """
        if not role:
            return "VACCINATOR"
        
        role_str = str(role).strip()
        role_upper = role_str.upper()
        
        # Map common variations to standard roles
        # Based on: ADMINISTRATOR, SUPERUSER, COUNTY_DISEASE_SURVEILLANCE_OFFICER,
        # SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER, FACILITY_SURVEILLANCE_FOCAL_PERSON,
        # SUPERVISORS, VACCINATOR
        role_mapping = {
            # Exact matches from CSV
            "SUB COUNTY DISEASE SURVEILLANCE OFFICER": "SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER",
            "SUBCOUNTY DISEASE SURVEILLANCE OFFICER": "SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER",
            "COUNTY DISEASE SURVEILLANCE OFFICER": "COUNTY_DISEASE_SURVEILLANCE_OFFICER",
            "FACILITY DISEASE SURVEILLANCE OFFICER": "FACILITY_SURVEILLANCE_FOCAL_PERSON",
            "NATIONAL": "ADMINISTRATOR",
            
            # System role names (already correct)
            "ADMINISTRATOR": "ADMINISTRATOR",
            "SUPERUSER": "SUPERUSER",
            "COUNTY_DISEASE_SURVEILLANCE_OFFICER": "COUNTY_DISEASE_SURVEILLANCE_OFFICER",
            "SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER": "SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER",
            "FACILITY_SURVEILLANCE_FOCAL_PERSON": "FACILITY_SURVEILLANCE_FOCAL_PERSON",
            "SUPERVISORS": "SUPERVISORS",
            "VACCINATOR": "VACCINATOR",
            
            # Common variations and abbreviations
            "ADMIN": "ADMINISTRATOR",
            "SUPER USER": "SUPERUSER",
            "COUNTY DSO": "COUNTY_DISEASE_SURVEILLANCE_OFFICER",
            "COUNTY_DSO": "COUNTY_DISEASE_SURVEILLANCE_OFFICER",
            "CDSO": "COUNTY_DISEASE_SURVEILLANCE_OFFICER",
            "SUBCOUNTY DSO": "SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER",
            "SUBCOUNTY_DSO": "SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER",
            "SUB COUNTY DSO": "SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER",
            "SCDSO": "SUBCOUNTY_DISEASE_SURVEILLANCE_OFFICER",
            "FACILITY DSO": "FACILITY_SURVEILLANCE_FOCAL_PERSON",
            "FACILITY_DSO": "FACILITY_SURVEILLANCE_FOCAL_PERSON",
            "FACILITY FOCAL": "FACILITY_SURVEILLANCE_FOCAL_PERSON",
            "FACILITY_FOCAL": "FACILITY_SURVEILLANCE_FOCAL_PERSON",
            "FOCAL PERSON": "FACILITY_SURVEILLANCE_FOCAL_PERSON",
            "SUPERVISOR": "SUPERVISORS",
            "NURSE": "VACCINATOR",
            "HEALTH WORKER": "VACCINATOR",
            "HEALTHWORKER": "VACCINATOR",
        }
        
        return role_mapping.get(role_upper, role_upper)
    
    def search_fhir_location(self, name: str, type_code: str) -> Optional[str]:
        """
        Search for a location in FHIR by name and type code
        
        Args:
            name: Location name to search for
            type_code: Location type code (FACILITY, WARD, SUB-COUNTY, COUNTY)
            
        Returns:
            FHIR location ID if found, None otherwise
        """
        if not name or not type_code:
            return None
        
        try:
            # URL encode the name for the query
            encoded_name = quote(name)
            
            # Build the search URL
            search_url = f"{self.fhir_url}/Location?name={encoded_name}&type:code={type_code}"
            
            # Make the request
            response = requests.get(
                search_url,
                headers={'Accept': 'application/fhir+json'},
                timeout=10
            )
            
            if response.status_code != 200:
                print(f"   ⚠️  FHIR API error (status {response.status_code}) for location '{name}' (type: {type_code})")
                return None
            
            # Parse the FHIR Bundle response
            bundle = response.json()
            
            if bundle.get('resourceType') != 'Bundle':
                print(f"   ⚠️  Unexpected FHIR response format for location '{name}'")
                return None
            
            entries = bundle.get('entry', [])
            
            if not entries:
                return None
            
            # Get the first matching location's ID
            first_entry = entries[0]
            resource = first_entry.get('resource', {})
            
            if resource.get('resourceType') == 'Location':
                location_id = resource.get('id')
                if location_id:
                    return location_id
            
            return None
            
        except requests.exceptions.RequestException as e:
            print(f"   ⚠️  Network error searching FHIR for location '{name}': {e}")
            return None
        except (json.JSONDecodeError, KeyError) as e:
            print(f"   ⚠️  Error parsing FHIR response for location '{name}': {e}")
            return None
        except Exception as e:
            print(f"   ⚠️  Unexpected error searching FHIR for location '{name}': {e}")
            return None
    
    def get_lowest_location(self, row: Dict) -> tuple:
        """
        Get the lowest level location from the CSV row based on hierarchy.
        Hierarchy (lowest to highest): Facility -> Ward -> SubCounty -> County
        Looks up FHIR location IDs for each found location.
        
        Args:
            row: Dictionary containing CSV row data
            
        Returns:
            Tuple of (fhir_location_id, location_type, original_name) where:
            - fhir_location_id: FHIR location ID if found, None otherwise
            - location_type: Type of location found (facility, ward, subcounty, county, none)
            - original_name: Original location name from CSV
        """
        # Type code mapping for FHIR API
        type_code_map = {
            'facility': 'FACILITY',
            'ward': 'WARD',
            'subcounty': 'SUB-COUNTY',
            'county': 'COUNTY'
        }
        
        # Check in order from lowest to highest in hierarchy
        # 1. Health Facility (lowest level)
        facility = row.get('Health Facility', '').strip()
        if facility:
            fhir_id = self.search_fhir_location(facility, 'FACILITY')
            return (fhir_id, 'facility', facility)
        
        # 2. Ward
        ward = row.get('Ward', '').strip()
        if ward:
            fhir_id = self.search_fhir_location(ward, 'WARD')
            return (fhir_id, 'ward', ward)
        
        # 3. SubCounty (check both variations)
        subcounty = row.get('SubCounty', '').strip() or row.get('Sub County', '').strip()
        if subcounty:
            fhir_id = self.search_fhir_location(subcounty, 'SUB-COUNTY')
            return (fhir_id, 'subcounty', subcounty)
        
        # 4. County (check all variations)
        county = row.get('County', '').strip() or row.get('County.', '').strip() or row.get('County_', '').strip()
        if county:
            fhir_id = self.search_fhir_location(county, 'COUNTY')
            return (fhir_id, 'county', county)
        
        # No location found
        return (None, 'none', None)
    
    def register_user(self, user_data: Dict) -> Dict:
        """
        Register a single user through the API
        
        Args:
            user_data: Dictionary containing user registration data
            
        Returns:
            API response dictionary
        """
        try:
            # Create a copy and remove internal fields before sending to API
            api_data = {k: v for k, v in user_data.items() if not k.startswith('_')}
            
            response = requests.post(
                self.register_url,
                json=api_data,
                headers={
                    'Content-Type': 'application/json',
                    'Cookie': 'frontend_lang=en_US'
                },
                timeout=30
            )
            
            # Try to parse JSON response
            try:
                response_data = response.json()
            except json.JSONDecodeError:
                response_data = {"error": response.text, "status_code": response.status_code}
            
            if response.status_code in [200, 201]:
                self.success_count += 1
                return {
                    "success": True,
                    "data": response_data,
                    "status_code": response.status_code
                }
            else:
                self.error_count += 1
                error_msg = response_data.get('error', response_data.get('message', 'Unknown error'))
                self.errors.append({
                    "user": f"{user_data.get('firstName')} {user_data.get('lastName')} ({user_data.get('idNumber')})",
                    "error": error_msg,
                    "status_code": response.status_code
                })
                return {
                    "success": False,
                    "error": error_msg,
                    "status_code": response.status_code
                }
        
        except requests.exceptions.RequestException as e:
            self.error_count += 1
            error_msg = str(e)
            self.errors.append({
                "user": f"{user_data.get('firstName')} {user_data.get('lastName')} ({user_data.get('idNumber')})",
                "error": error_msg
            })
            return {
                "success": False,
                "error": error_msg
            }
    
    def process_csv_row(self, row: Dict, auto_password: bool = True, default_password: Optional[str] = None) -> Optional[Dict]:
        """
        Process a single CSV row and prepare user data for registration
        
        Args:
            row: Dictionary containing CSV row data
            auto_password: Whether to auto-generate passwords
            default_password: Default password to use if not auto-generating
            
        Returns:
            Prepared user data dictionary or None if invalid
        """
        # Extract fields from CSV (handling duplicate column names)
        # Note: When csv.DictReader encounters duplicate column names, it keeps the last one
        # So we need to check for email in multiple possible locations
        
        first_name = row.get('First Name', '').strip()
        last_name = row.get('LastName', row.get('Last Name', '')).strip()
        
        # Handle duplicate "Email Address" columns - try to get email from any of them
        # csv.DictReader will overwrite duplicate keys, so we check the standard key
        # If empty, we could check row values directly, but typically the last duplicate wins
        email = row.get('Email Address', '').strip()
        
        # If email is empty, try to find it in the row values (in case of duplicate columns)
        if not email:
            # Check all values in the row for something that looks like an email
            for key, value in row.items():
                if 'email' in key.lower() and value and '@' in str(value):
                    email = str(value).strip()
                    break
        
        phone = self.clean_phone(row.get('Phone Number', ''))
        id_number = str(row.get('ID Number', '')).strip()
        role = self.normalize_role(row.get('Role', ''))
        
        # Get the lowest level location from hierarchy (with FHIR lookup)
        fhir_location_id, location_type, original_location_name = self.get_lowest_location(row)
        
        # Validate required fields
        missing_fields = []
        if not first_name:
            missing_fields.append("First Name")
        if not last_name:
            missing_fields.append("LastName")
        if not email:
            missing_fields.append("Email Address")
        if not id_number:
            missing_fields.append("ID Number")
        if not role:
            missing_fields.append("Role")
        
        if missing_fields:
            print(f"⚠️  Skipping row - missing required fields: {', '.join(missing_fields)}")
            if first_name or last_name:
                print(f"   User: {first_name} {last_name} (ID: {id_number})")
            return None
        
        # Validate location for non-administrator roles
        if role != "ADMINISTRATOR":
            if not fhir_location_id:
                location_type_display = location_type.upper().replace('_', '-') if location_type != 'none' else 'location'
                if original_location_name:
                    print(f"⚠️  Skipping row - location not found in FHIR: '{original_location_name}' (type: {location_type_display})")
                else:
                    print(f"⚠️  Skipping row - no location data in CSV and location is required for role {role}")
                if first_name or last_name:
                    print(f"   User: {first_name} {last_name} (ID: {id_number})")
                return None
        
        # Generate or use default password
        if auto_password:
            password = self.generate_password()
        elif default_password:
            password = default_password
        else:
            password = None  # API will generate one
        
        # Prepare user data
        user_data = {
            "firstName": first_name,
            "lastName": last_name,
            "email": email,
            "idNumber": id_number,
            "role": role,
        }
        
        # Add optional fields
        if phone:
            user_data["phone"] = phone
        
        if password:
            user_data["password"] = password
        
        # Add location information
        # Note: For ADMINISTRATOR/National roles, location is not required
        if role != "ADMINISTRATOR":
            if fhir_location_id:
                user_data["facility"] = fhir_location_id  # API uses "facility" field for all location types
                user_data["_location_type"] = location_type  # Store type for display purposes
                user_data["_original_location_name"] = original_location_name  # Store original name for display
            else:
                # This should not happen due to validation above, but handle it anyway
                user_data["facility"] = ""
                user_data["_location_type"] = "none"
                user_data["_original_location_name"] = original_location_name or ""
        else:
            # For ADMINISTRATOR roles, don't add facility field (not required)
            user_data["_location_type"] = "none"
            user_data["_original_location_name"] = ""
        
        return user_data
    
    def process_csv(self, csv_file: str, auto_password: bool = True, 
                   default_password: Optional[str] = None, 
                   dry_run: bool = False,
                   delay: float = 0.5) -> None:
        """
        Process CSV file and register all users
        
        Args:
            csv_file: Path to CSV file
            auto_password: Whether to auto-generate passwords
            default_password: Default password to use if not auto-generating
            dry_run: If True, don't actually register users
            delay: Delay between requests in seconds
        """
        print(f"\n{'='*60}")
        print(f"Bulk User Registration - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'='*60}")
        print(f"API Host: {self.api_host}")
        print(f"CSV File: {csv_file}")
        print(f"Dry Run: {dry_run}")
        print(f"{'='*60}\n")
        
        if not os.path.exists(csv_file):
            print(f"❌ Error: CSV file not found: {csv_file}")
            sys.exit(1)
        
        users_to_register = []
        failed_rows = []  # Track rows that failed due to missing emails
        
        # Read and process CSV
        try:
            with open(csv_file, 'r', encoding='utf-8') as f:
                # Try to detect the CSV format
                sample = f.read(1024)
                f.seek(0)
                
                # Use csv.Sniffer to detect delimiter
                try:
                    dialect = csv.Sniffer().sniff(sample)
                    reader = csv.reader(f, dialect=dialect)
                except csv.Error:
                    # Fall back to default comma delimiter
                    reader = csv.reader(f)
                
                # Read header row
                headers = next(reader)
                
                # Create a mapping of column names to indices, handling duplicates
                # For duplicates, we'll use the FIRST occurrence
                column_map = {}
                for idx, header in enumerate(headers):
                    header_clean = header.strip()
                    # Only map if we haven't seen this header before (use first occurrence)
                    if header_clean not in column_map:
                        column_map[header_clean] = idx
                    # Check for duplicates and warn
                    elif header_clean in column_map:
                        # This is a duplicate - we already have the first one mapped
                        pass
                
                # Check for duplicates and warn
                seen = {}
                duplicates = []
                for i, name in enumerate(headers):
                    name_clean = name.strip()
                    if name_clean in seen:
                        duplicates.append(f"Column '{name_clean}' appears at positions {seen[name_clean]+1} and {i+1} (using position {seen[name_clean]+1})")
                    else:
                        seen[name_clean] = i
                
                if duplicates:
                    print("⚠️  Warning: Duplicate column names detected:")
                    for dup in duplicates:
                        print(f"   {dup}")
                    print()
                
                print("📋 Processing CSV rows...\n")
                
                for idx, row in enumerate(reader, start=1):
                    # Convert row list to dict using our column mapping
                    row_dict = {}
                    for col_name, col_idx in column_map.items():
                        if col_idx < len(row):
                            row_dict[col_name] = row[col_idx]
                        else:
                            row_dict[col_name] = ''
                    
                    # Check if email is missing before processing
                    email = row_dict.get('Email Address', '').strip()
                    is_missing_email = not email
                    
                    user_data = self.process_csv_row(row_dict, auto_password, default_password)
                    
                    if user_data:
                        users_to_register.append({
                            "row": idx,
                            "data": user_data,
                            "password": user_data.get("password")
                        })
                        print(f"✓ Row {idx}: {user_data['firstName']} {user_data['lastName']} ({user_data['email']})")
                    else:
                        print(f"✗ Row {idx}: Skipped due to validation errors")
                        # If email is missing, save the original row
                        if is_missing_email:
                            # Pad row to match header length if needed
                            padded_row = row + [''] * (len(headers) - len(row))
                            failed_rows.append({
                                "row_number": idx,
                                "row_data": padded_row[:len(headers)]  # Ensure same length as headers
                            })
        
        except Exception as e:
            print(f"❌ Error reading CSV file: {e}")
            sys.exit(1)
        
        print(f"\n{'='*60}")
        print(f"Found {len(users_to_register)} valid users to register")
        if failed_rows:
            print(f"Found {len(failed_rows)} rows with missing emails")
        print(f"{'='*60}\n")
        
        # Save failed rows to CSV
        if failed_rows:
            self.save_failed_rows(csv_file, headers, failed_rows)
        
        if dry_run:
            print("🔍 DRY RUN MODE - No users will be registered\n")
            for user in users_to_register:
                user_data = user['data']
                location_id = user_data.get('facility', '')
                location_type = user_data.get('_location_type', 'none')
                original_location_name = user_data.get('_original_location_name', '')
                
                # Format location display
                if user_data.get('role') == 'ADMINISTRATOR':
                    location_display = 'N/A (Administrator - no location required)'
                elif location_id:
                    # Show FHIR ID and original name
                    location_type_name = location_type.upper().replace('_', '-') if location_type != 'none' else 'UNKNOWN'
                    
                    if original_location_name:
                        location_display = f"FHIR ID: {location_id} ({location_type_name}: '{original_location_name}')"
                    else:
                        location_display = f"FHIR ID: {location_id} ({location_type_name})"
                else:
                    # No location found - this shouldn't happen in dry-run as validation happens earlier
                    if original_location_name:
                        location_type_name = location_type.upper().replace('_', '-') if location_type != 'none' else 'UNKNOWN'
                        location_display = f"⚠️ NOT FOUND IN FHIR ({location_type_name}: '{original_location_name}')"
                    else:
                        location_display = '⚠️ MISSING (no location data in CSV)'
                
                print(f"Would register:")
                print(f"  Name: {user_data['firstName']} {user_data['lastName']}")
                print(f"  Email: {user_data['email']}")
                print(f"  ID Number: {user_data['idNumber']}")
                print(f"  Role: {user_data['role']}")
                print(f"  Location: {location_display}")
                if user_data.get('phone'):
                    print(f"  Phone: {user_data['phone']}")
                print()
            return
        
        # Confirm before proceeding
        if not self.confirm_registration(len(users_to_register)):
            print("\n❌ Registration cancelled by user")
            sys.exit(0)
        
        print("\n🚀 Starting user registration...\n")
        
        # Register users
        results = []
        for user in users_to_register:
            row_num = user['row']
            user_data = user['data']
            password = user['password']
            
            print(f"Registering row {row_num}: {user_data['firstName']} {user_data['lastName']}...", end=" ")
            
            result = self.register_user(user_data)
            result['row'] = row_num
            result['email'] = user_data['email']
            result['name'] = f"{user_data['firstName']} {user_data['lastName']}"
            result['password'] = password
            results.append(result)
            
            if result['success']:
                print("✅")
            else:
                print(f"❌ {result.get('error', 'Unknown error')}")
            
            # Delay between requests to avoid overwhelming the server
            time.sleep(delay)
        
        # Print summary
        self.print_summary(results)
        
        # Save results to file
        self.save_results(results, csv_file)
    
    def confirm_registration(self, count: int) -> bool:
        """
        Ask user for confirmation before registering users
        
        Args:
            count: Number of users to register
            
        Returns:
            True if user confirms, False otherwise
        """
        try:
            response = input(f"\n⚠️  About to register {count} users. Continue? (yes/no): ").strip().lower()
            return response in ['yes', 'y']
        except (EOFError, KeyboardInterrupt):
            return False
    
    def print_summary(self, results: List[Dict]) -> None:
        """Print registration summary"""
        print(f"\n{'='*60}")
        print("REGISTRATION SUMMARY")
        print(f"{'='*60}")
        print(f"Total Processed: {len(results)}")
        print(f"✅ Successful: {self.success_count}")
        print(f"❌ Failed: {self.error_count}")
        print(f"{'='*60}\n")
        
        if self.errors:
            print("ERRORS:")
            print(f"{'='*60}")
            for error in self.errors:
                print(f"❌ {error['user']}")
                print(f"   Error: {error['error']}")
                if 'status_code' in error:
                    print(f"   Status Code: {error['status_code']}")
                print()
    
    def save_failed_rows(self, csv_file: str, headers: List[str], failed_rows: List[Dict]) -> None:
        """
        Save rows with missing emails to a CSV file
        
        Args:
            csv_file: Original CSV file name
            headers: CSV header row
            failed_rows: List of failed row data
        """
        output_file = "failed_missing_emails.csv"
        
        try:
            with open(output_file, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                # Write headers
                writer.writerow(headers)
                # Write failed rows
                for failed_row in failed_rows:
                    writer.writerow(failed_row['row_data'])
            
            print(f"📄 Rows with missing emails saved to: {output_file}")
            print(f"   Total rows: {len(failed_rows)}")
        except Exception as e:
            print(f"⚠️  Warning: Could not save failed rows to CSV: {e}")
    
    def save_results(self, results: List[Dict], csv_file: str) -> None:
        """
        Save registration results to a file
        
        Args:
            results: List of registration results
            csv_file: Original CSV file name (used to create output filename)
        """
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        output_file = f"registration_results_{timestamp}.json"
        output_csv = f"registration_credentials_{timestamp}.csv"
        
        # Save JSON results
        try:
            with open(output_file, 'w') as f:
                json.dump(results, f, indent=2)
            print(f"📄 Detailed results saved to: {output_file}")
        except Exception as e:
            print(f"⚠️  Warning: Could not save results to JSON: {e}")
        
        # Save credentials CSV for successful registrations
        try:
            successful = [r for r in results if r.get('success')]
            if successful:
                with open(output_csv, 'w', newline='') as f:
                    writer = csv.DictWriter(f, fieldnames=['name', 'email', 'password'])
                    writer.writeheader()
                    for result in successful:
                        if result.get('password'):  # Only write if password is available
                            writer.writerow({
                                'name': result['name'],
                                'email': result['email'],
                                'password': result['password']
                            })
                print(f"📄 Credentials saved to: {output_csv}")
                print(f"⚠️  IMPORTANT: Store this file securely and share credentials with users through secure channels!")
        except Exception as e:
            print(f"⚠️  Warning: Could not save credentials to CSV: {e}")


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        description='Bulk register users from CSV to HIE Auth service',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Example usage:
  # Register users with auto-generated passwords
  python bulk_register.py users.csv
  
  # Use a specific API host
  python bulk_register.py users.csv --api-host http://hie-auth:3000
  
  # Dry run to validate CSV without registering
  python bulk_register.py users.csv --dry-run
  
  # Use a default password for all users
  python bulk_register.py users.csv --default-password "ChangeMe123!"
  
CSV Format:
  Required columns: First Name, LastName, Email Address, ID Number, Role
  Optional columns: Phone Number, Health Facility
  
  Example:
  First Name,LastName,Email Address,ID Number,Phone Number,Role,Health Facility
  John,Doe,john@example.com,12345678,0712345678,HEALTH_WORKER,facility-id-123
        """
    )
    
    parser.add_argument('csv_file', help='Path to CSV file containing user data')
    parser.add_argument('--api-host', default='https://auth.nphiis.health.go.ke',
                       help='HIE Auth API host (default: https://auth.nphiis.health.go.ke)')
    parser.add_argument('--fhir-url', default='https://dsrfhir.intellisoftkenya.com/hapi/fhir',
                       help='FHIR API base URL (default: https://dsrfhir.intellisoftkenya.com/hapi/fhir)')
    parser.add_argument('--default-password', help='Default password for all users (if not specified, passwords are auto-generated)')
    parser.add_argument('--no-auto-password', action='store_true',
                       help='Do not auto-generate passwords (API will generate them)')
    parser.add_argument('--dry-run', action='store_true',
                       help='Validate CSV without actually registering users')
    parser.add_argument('--delay', type=float, default=0.5,
                       help='Delay between registration requests in seconds (default: 0.5)')
    
    args = parser.parse_args()
    
    # Initialize bulk registration handler
    handler = BulkRegistration(api_host=args.api_host, fhir_url=args.fhir_url)
    
    # Process CSV
    auto_password = not args.no_auto_password
    handler.process_csv(
        csv_file=args.csv_file,
        auto_password=auto_password,
        default_password=args.default_password,
        dry_run=args.dry_run,
        delay=args.delay
    )


if __name__ == "__main__":
    main()

