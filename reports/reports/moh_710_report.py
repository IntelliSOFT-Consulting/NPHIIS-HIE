from datetime import datetime
from sqlalchemy import func, or_, and_, case
from configs import db
from typing import Dict, Any, List
from models.dataset import PrimaryImmunizationDataset

def parse_date(date_string: str) -> str:
    """Parse date string to consistent format."""
    return datetime.strptime(date_string, "%Y-%m-%d").strftime("%Y-%m-%d")

def build_section_a_query(
    facility_code: str = None,
    county: str = None,
    subcounty: str = None,
    ward: str = None,
    start_date: str = None,
    end_date: str = None,
):
    """Build query specifically for Section A of MOH 710."""
    # Base location filter
    location_filter = True
    if facility_code:
        location_filter = PrimaryImmunizationDataset.facility_code == facility_code
    elif county:
        location_filter = PrimaryImmunizationDataset.county.ilike(f"%{county}%")
    elif subcounty:
        location_filter = PrimaryImmunizationDataset.subcounty.ilike(f"%{subcounty}%")
    elif ward:
        location_filter = PrimaryImmunizationDataset.ward.ilike(f"%{ward}%")

    # Query for immunization data
    query = (
        db.session.query(
            PrimaryImmunizationDataset.administered_date,
            PrimaryImmunizationDataset.vaccine_name,
            PrimaryImmunizationDataset.age_group,
            PrimaryImmunizationDataset.vaccine_category,
            PrimaryImmunizationDataset.immunization_status,
            func.count().label("total_count"),
            func.sum(
                case(
                    (
                        PrimaryImmunizationDataset.administration_location == "Facility",
                        1
                    ),
                    else_=0
                )
            ).label("facility_count"),
            func.sum(
                case(
                    (
                        PrimaryImmunizationDataset.administration_location == "Outreach",
                        1
                    ),
                    else_=0
                )
            ).label("outreach_count"),
        )
        .filter(
            and_(
                location_filter,
                PrimaryImmunizationDataset.administered_date.between(start_date, end_date),
                PrimaryImmunizationDataset.vaccine_category == "routine",
                PrimaryImmunizationDataset.immunization_status == "completed"
            )
        )
        .group_by(
            PrimaryImmunizationDataset.administered_date,
            PrimaryImmunizationDataset.vaccine_name,
            PrimaryImmunizationDataset.age_group,
            PrimaryImmunizationDataset.vaccine_category,
            PrimaryImmunizationDataset.immunization_status,
        )
    )

    return query

def format_section_a_data(results) -> Dict[str, Any]:
    """Format query results into MOH 710 Section A structure."""
    # Initialize data structure for Section A
    section_a = {
        "BCG": {"Under 1 year": 0, "Above 1 year": 0},
        "OPV Birth Dose": {"Under 1 year": 0, "Above 1 year": 0},
        "OPV1": {"Under 1 year": 0, "Above 1 year": 0},
        "OPV2": {"Under 1 year": 0, "Above 1 year": 0},
        "OPV3": {"Under 1 year": 0, "Above 1 year": 0},
        "IPV": {"Under 1 year": 0, "Above 1 year": 0},
        "DPT-HepB-Hib 1": {"Under 1 year": 0, "Above 1 year": 0},
        "DPT-HepB-Hib 2": {"Under 1 year": 0, "Above 1 year": 0},
        "DPT-HepB-Hib 3": {"Under 1 year": 0, "Above 1 year": 0},
        "PCV10 1": {"Under 1 year": 0, "Above 1 year": 0},
        "PCV10 2": {"Under 1 year": 0, "Above 1 year": 0},
        "PCV10 3": {"Under 1 year": 0, "Above 1 year": 0},
        "Rota 1": {"Under 1 year": 0, "Above 1 year": 0},
        "Rota 2": {"Under 1 year": 0, "Above 1 year": 0},
        "Rota 3": {"Under 1 year": 0, "Above 1 year": 0},
        "Vitamin A": {"Under 1 year": 0, "Above 1 year": 0},
        "Yellow Fever": {"Under 1 year": 0, "Above 1 year": 0},
        "Measles-Rubella 1": {"Under 1 year": 0, "Above 1 year": 0},
        "Measles-Rubella 2": {"Under 1 year": 0, "Above 1 year": 0},
    }

    # Map vaccine names from database to MOH 710 format
    vaccine_mapping = {
        "BCG": "BCG",
        "bOPV": "OPV Birth Dose",
        "OPV 1": "OPV1",
        "OPV 2": "OPV2",
        "OPV 3": "OPV3",
        "IPV": "IPV",
        "DPT-HepB+Hib 1": "DPT-HepB-Hib 1",
        "DPT-HepB+Hib 2": "DPT-HepB-Hib 2",
        "DPT-HepB+Hib 3": "DPT-HepB-Hib 3",
        "PCV10 1": "PCV10 1",
        "PCV10 2": "PCV10 2",
        "PCV10 3": "PCV10 3",
        "Rotavaq 1": "Rota 1",
        "Rotavaq 2": "Rota 2",
        "Rotavaq 3": "Rota 3",
        "Vitamin A": "Vitamin A",
        "Yellow Fever": "Yellow Fever",
        "Measles-Rubella 1": "Measles-Rubella 1",
        "Measles-Rubella 2": "Measles-Rubella 2",
    }

    # Process results
    for result in results:
        moh_vaccine_name = vaccine_mapping.get(result.vaccine_name)
        if moh_vaccine_name and moh_vaccine_name in section_a:
            age_group = "Under 1 year" if result.age_group == "Below 1 year" else "Above 1 year"
            section_a[moh_vaccine_name][age_group] += result.total_count

    return {
        "data": section_a,
        "metadata": {
            "facility_total": sum(
                sum(counts.values()) for counts in section_a.values()
            ),
        }
    }

def generate_moh_710_section_a(filters: Dict[str, str]) -> Dict[str, Any]:
    """Generate MOH 710 Section A report."""
    try:
        # Parse dates
        start_date = parse_date(filters.get("start_date"))
        end_date = parse_date(filters.get("end_date"))

        # Build and execute query
        query = build_section_a_query(
            facility_code=filters.get("facility"),
            county=filters.get("county"),
            subcounty=filters.get("subcounty"),
            ward=filters.get("ward"),
            start_date=start_date,
            end_date=end_date
        )
        
        results = query.all()

        # Format data for Section A
        report_data = format_section_a_data(results)

        # Add report metadata
        report_data["metadata"].update({
            "report_period": f"{start_date} to {end_date}",
            "facility": filters.get("facility"),
            "county": filters.get("county"),
            "subcounty": filters.get("subcounty"),
            "ward": filters.get("ward"),
            "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        })

        return report_data

    except Exception as e:
        db.session.rollback()
        raise Exception(f"Error generating MOH 710 Section A: {str(e)}")