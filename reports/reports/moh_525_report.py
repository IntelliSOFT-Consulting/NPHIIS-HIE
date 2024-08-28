from models.dataset import PrimaryImmunizationDataset
from datetime import datetime, timedelta
from sqlalchemy import func, or_, and_, cast, Date
from configs import db


def moh_525_report(filters):
    facility_code = filters.get("facility_code")
    country = filters.get("country")
    county = filters.get("county")
    subcounty = filters.get("subcounty")
    start_date = filters.get("start_date")
    end_date = filters.get("end_date")

    # Ensure start_date and end_date are in 'YYYY-MM-DD' format
    start_date = datetime.strptime(start_date, "%Y-%m-%d").strftime("%Y-%m-%d")
    end_date = datetime.strptime(end_date, "%Y-%m-%d").strftime("%Y-%m-%d")

    facility_filter = PrimaryImmunizationDataset.facility_code == facility_code

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
            PrimaryImmunizationDataset.national_id,
            PrimaryImmunizationDataset.given_name,
            PrimaryImmunizationDataset.family_name,
            PrimaryImmunizationDataset.gender,
            PrimaryImmunizationDataset.age_m,
            PrimaryImmunizationDataset.pat_relation_name,
            PrimaryImmunizationDataset.phone,
            PrimaryImmunizationDataset.ward,
            PrimaryImmunizationDataset.vaccine_name,
            PrimaryImmunizationDataset.imm_status,
            PrimaryImmunizationDataset.faci_outr,
            PrimaryImmunizationDataset.due_date,
        )
        .filter(
            and_(
                facility_filter,
                PrimaryImmunizationDataset.due_date >= start_date,
                PrimaryImmunizationDataset.due_date <= end_date,
                or_(
                    PrimaryImmunizationDataset.imm_status
                    == "Immunized Late (Within 14 Days)",
                    PrimaryImmunizationDataset.imm_status == "Missed Immunization",
                ),
            )
        )
        .order_by(PrimaryImmunizationDataset.due_date)
    )

    # Execute the query and fetch results
    results = query.all()

    formatted_data = []

    for idx, result in enumerate(results, start=1):
        outcome = ""
        if result.faci_outr == "Facility":
            outcome = "Traced & vaccinated at the facility"
        elif result.faci_outr == "Outreach":
            outcome = "Vaccinated at another facility/outreach"
        elif result.imm_status == "Missed Immunization":
            outcome = "Lost to follow up"
        else:
            outcome = "Vaccinated at the facility & NOT documented"

        child_name = f"{result.given_name or ''} {result.family_name or ''}".strip()
        child_name = child_name if child_name else "Name not provided"

        formatted_data.append(
            {
                "Date": result.due_date,
                "Serial No (MOH510)": "",
                "Child's No": result.national_id,
                "Name of the Child": child_name,
                "Sex (F/M)": result.gender,
                "Age in Months of the Child": result.age_m,
                "Name of Parent/Caregiver": result.pat_relation_name,
                "Telephone No.": result.phone,
                "Name of Village/Estate/Landmark": result.ward,
                "Vaccines Missed": result.vaccine_name,
                "Traced (YES/NO)": (
                    "Yes"
                    if result.imm_status == "Immunized Late (Within 14 Days)"
                    else "No"
                ),
                "Outcome": outcome,
                "Remarks": None,
            }
        )

    return formatted_data
