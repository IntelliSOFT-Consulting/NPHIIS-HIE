from models.dataset import PrimaryImmunizationDataset
from datetime import datetime, timedelta
from sqlalchemy import func, or_, and_, cast, Date
from configs import db


def moh_525_report(filters):
    facility_code = filters.get("facility")
    country = filters.get("country")
    county = filters.get("county")
    subcounty = filters.get("subcounty")
    start_date = filters.get("start_date")
    end_date = filters.get("end_date")

    # Ensure start_date and end_date are in 'YYYY-MM-DD' format
    start_date = datetime.strptime(start_date, "%Y-%m-%d").strftime("%Y-%m-%d")
    end_date = datetime.strptime(end_date, "%Y-%m-%d").strftime("%Y-%m-%d")

    facility_filter = None

    if not any([facility_code, country, county, subcounty]):
        facility_filter = PrimaryImmunizationDataset.facility_code.isnot(None)

    if country:
        facility_filter = or_(
            PrimaryImmunizationDataset.county.ilike(f"%{country}%"),
            PrimaryImmunizationDataset.county.is_(None),
        )
    elif county:
        facility_filter = PrimaryImmunizationDataset.county.ilike(f"%{county}%")
    elif subcounty:
        facility_filter = PrimaryImmunizationDataset.subcounty.ilike(f"%{subcounty}%")

    query = (
        db.session.query(
            PrimaryImmunizationDataset.document_id,  # instead of national_id
            PrimaryImmunizationDataset.given_name,
            PrimaryImmunizationDataset.family_name,
            PrimaryImmunizationDataset.gender,
            PrimaryImmunizationDataset.age_months,  # instead of age_m
            PrimaryImmunizationDataset.guardian_name,  # instead of pat_relation_name
            PrimaryImmunizationDataset.phone_primary,  # primary phone number
            PrimaryImmunizationDataset.ward,
            PrimaryImmunizationDataset.vaccine_name,
            PrimaryImmunizationDataset.immunization_status,  # instead of imm_status
            PrimaryImmunizationDataset.administration_location,  # instead of faci_outr
            PrimaryImmunizationDataset.schedule_due_date,  # instead of due_date
            PrimaryImmunizationDataset.is_defaulter,  # instead of imm_status_defaulter
            PrimaryImmunizationDataset.days_from_due_date,
        )
        .filter(
            and_(
                facility_filter,
                PrimaryImmunizationDataset.schedule_due_date >= start_date,
                PrimaryImmunizationDataset.schedule_due_date <= end_date,
                PrimaryImmunizationDataset.vaccine_category == "routine",
                PrimaryImmunizationDataset.is_defaulter == True,
            )
        )
        .order_by(PrimaryImmunizationDataset.schedule_due_date)
    )

    # Execute the query and fetch results
    results = query.all()

    formatted_data = []

    for idx, result in enumerate(results, start=1):
        # Determine outcome based on new model's fields
        outcome = ""
        if result.administration_location == "Facility":
            outcome = "Traced & vaccinated at the facility"
        elif result.administration_location == "Outreach":
            outcome = "Vaccinated at another facility/outreach"
        elif result.immunization_status == "Not Administered":
            outcome = "Lost to follow up"
        else:
            outcome = "Vaccinated at the facility & NOT documented"

        # Construct child's name
        child_name = f"{result.given_name or ''} {result.family_name or ''}".strip()
        child_name = child_name if child_name else "Name not provided"

        # Get primary contact number
        contact_number = result.phone_primary or "No contact provided"

        formatted_data.append(
            {
                "Date": result.schedule_due_date,
                "Serial No (MOH510)": "",
                "Child's No": result.document_id,
                "Name of the Child": child_name,
                "Sex (F/M)": result.gender,
                "Age in Months of the Child": result.age_months,
                "Name of Parent/Caregiver": result.guardian_name,
                "Telephone No.": contact_number,
                "Name of Village/Estate/Landmark": result.ward,
                "Vaccines Missed": result.vaccine_name,
                "Traced (YES/NO)": (
                    "Yes"
                    if result.days_from_due_date and result.days_from_due_date <= 14
                    else "No"
                ),
                "Outcome": outcome,
                "Remarks": (
                    f"Overdue by {result.days_from_due_date} days"
                    if result.days_from_due_date
                    else None
                ),
            }
        )

    return formatted_data
