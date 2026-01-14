# Bulk Registration - Quick Reference

## 🚀 Production Use (NPHIIS)

```bash
# Step 1: Install dependencies
pip install -r requirements.txt

# Step 2: Prepare your CSV with columns:
# - First Name, LastName, Email Address, ID Number, Role, Phone Number, Health Facility

# Step 3: Test with dry run
python bulk_register.py your_file.csv \
  --api-host https://auth.nphiis.nphl.go.ke \
  --dry-run

# Step 4: Register users
python bulk_register.py your_file.csv \
  --api-host https://auth.nphiis.nphl.go.ke

# Step 5: Check output files
cat registration_credentials_*.csv
```

## 📝 CSV Role Names (Human-Readable)

Your CSV can use these exact role names:
- ✅ **"National"** - For administrators
- ✅ **"County Disease Surveillance Officer"** - County level
- ✅ **"Sub County Disease Surveillance Officer"** - Sub-county level  
- ✅ **"Facility Disease Surveillance Officer"** - Facility level

## 🏥 Facility ID Requirements

| Role | Facility Required? | Example Facility ID |
|------|-------------------|-------------------|
| National / Administrator | ❌ No (leave empty) | (empty) |
| County DSO | ✅ Yes | 25 |
| Sub-County DSO | ✅ Yes | 40 |
| Facility DSO | ✅ Yes | 123 |
| Supervisors | ✅ Yes | 156 |
| Vaccinator | ✅ Yes | 89 |

## 📱 Phone Number Formats (All Supported)

The script accepts any of these formats and converts to `+254XXXXXXXXX`:
- `0712345678` → `+254712345678` ✅
- `712345678` → `+254712345678` ✅
- `254712345678` → `+254712345678` ✅
- `+254712345678` → `+254712345678` ✅

## 🔑 Password Options

### Auto-generated (Recommended)
```bash
python bulk_register.py users.csv --api-host https://auth.nphiis.nphl.go.ke
# Generates unique 12-character passwords for each user
# Saved in: registration_credentials_[timestamp].csv
```

### Same Password for All
```bash
python bulk_register.py users.csv \
  --api-host https://auth.nphiis.nphl.go.ke \
  --default-password "TempPass2025!"
```

### Let API Generate
```bash
python bulk_register.py users.csv \
  --api-host https://auth.nphiis.nphl.go.ke \
  --no-auto-password
```

## 📊 Output Files

After registration completes:

1. **`registration_credentials_TIMESTAMP.csv`**
   - Username (ID Number)
   - Email
   - Password
   - ⚠️ **SECURE THIS FILE - Contains plaintext passwords!**

2. **`registration_results_TIMESTAMP.json`**
   - Detailed registration results
   - Success/failure status for each user
   - Error messages if any

## ⚡ Performance Tuning

### Large Batch (1000+ users)
```bash
python bulk_register.py users.csv \
  --api-host https://auth.nphiis.nphl.go.ke \
  --delay 1.0
# Adds 1 second delay between requests
```

### Small Batch (< 100 users)
```bash
python bulk_register.py users.csv \
  --api-host https://auth.nphiis.nphl.go.ke \
  --delay 0.2
# Faster registration with 0.2s delay
```

## 🐛 Common Issues & Solutions

### Issue: "facility required" error
**Solution:** Ensure non-administrator roles have a facility ID in the CSV

### Issue: "invalid role" error  
**Solution:** Check role name matches one of the supported roles (see above)

### Issue: Connection timeout
**Solution:** 
1. Check network connectivity
2. Verify API host URL is correct
3. Try increasing `--delay` value

### Issue: "user already exists"
**Solution:** User with that ID Number is already registered. Check or update existing user.

## 📋 Minimal CSV Example

```csv
First Name,LastName,Email Address,ID Number,Phone Number,Role,Health Facility
John,Doe,john@example.com,12345678,0712345678,Sub County Disease Surveillance Officer,40
Jane,Smith,jane@example.com,23456789,0723456789,County Disease Surveillance Officer,25
Admin,User,admin@health.go.ke,34567890,0734567890,National,
```

## 🔐 Security Checklist

- [ ] Use HTTPS for production (`https://auth.nphiis.nphl.go.ke`)
- [ ] Run dry-run first to validate data
- [ ] Secure the credentials CSV file immediately after generation
- [ ] Share passwords through secure channels (not email)
- [ ] Delete/archive credentials file after distribution
- [ ] Encourage users to change password on first login
- [ ] Keep registration results for audit trail

## 📞 Need Help?

```bash
# Show all options
python bulk_register.py --help

# Test with sample data
python bulk_register.py sample_users.csv --dry-run

# Check script version/info
head -20 bulk_register.py
```

---
**Last Updated:** December 2025  
**Script Version:** 1.0

