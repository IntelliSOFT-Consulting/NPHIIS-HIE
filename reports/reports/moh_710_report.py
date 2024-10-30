from models.dataset import PrimaryImmunizationDataset
from datetime import datetime
from sqlalchemy import func, or_, and_, case
from configs import db
from collections import defaultdict
from typing import Dict, Any, List


def parse_date(date_string: str) -> str:
    return datetime.strptime(date_string, "%Y-%m-%d").strftime("%Y-%m-%d")


def build_query(
    facility_code: str,
    country: str,
    county: str,
    subcounty: str,
    start_date: str,
    end_date: str,
):
    facility_filter = None

    if not any([facility_code, country, county, subcounty]):
        facility_filter = PrimaryImmunizationDataset.facility_code.isnot(None)
    elif country:
        facility_filter = or_(
            PrimaryImmunizationDataset.county.ilike(f"%{country}%"),
            PrimaryImmunizationDataset.county.is_(None),
        )
    elif county:
        facility_filter = PrimaryImmunizationDataset.county.ilike(f"%{county}%")
    elif subcounty:
        facility_filter = PrimaryImmunizationDataset.subcounty.ilike(f"%{subcounty}%")
    elif facility_code:
        facility_filter = PrimaryImmunizationDataset.facility_code == facility_code

    return (
        db.session.query(
            PrimaryImmunizationDataset.administered_date,  # Changed from occ_date
            PrimaryImmunizationDataset.vaccine_name,
            PrimaryImmunizationDataset.age_group,
            func.sum(
                case(
                    (
                        PrimaryImmunizationDataset.administration_location
                        == "Facility",
                        1,
                    ),  # Changed from faci_outr
                    else_=0,
                )
            ).label("facility_count"),
            func.sum(
                case(
                    (
                        PrimaryImmunizationDataset.administration_location
                        == "Outreach",
                        1,
                    ),  # Changed from faci_outr
                    else_=0,
                )
            ).label("outreach_count"),
            func.count().label("total_count"),
        )
        .filter(
            and_(
                facility_filter,
                PrimaryImmunizationDataset.vaccine_category == "routine",
                PrimaryImmunizationDataset.immunization_status
                == "completed",  # Added status filter
                PrimaryImmunizationDataset.administered_date.between(
                    start_date, end_date
                ),  # Changed from occ_date
            )
        )
        .group_by(
            PrimaryImmunizationDataset.administered_date,  # Changed from occ_date
            PrimaryImmunizationDataset.vaccine_name,
            PrimaryImmunizationDataset.age_group,
        )
        .order_by(
            PrimaryImmunizationDataset.administered_date,  # Changed from occ_date
            PrimaryImmunizationDataset.vaccine_name,
            PrimaryImmunizationDataset.age_group,
        )
    )


def process_results(results: List[Any]) -> Dict[tuple, Dict[str, Any]]:
    data = defaultdict(
        lambda: {
            "antigen": "",
            "ageGroup": "Below 1 year",  # Changed from "Under 1 Year"
            "total": 0,
            "facility_count": 0,
            "outreach_count": 0,
        }
    )

    for result in results:
        for age_group in ["Below 1 year", "Above 1 year"]:  # Updated age group names
            key = (result.vaccine_name, age_group)
            if not data[key]["antigen"]:
                data[key]["antigen"] = result.vaccine_name
                data[key]["ageGroup"] = age_group

            if data[key]["ageGroup"] == result.age_group:
                data[key]["total"] += result.total_count
                data[key]["facility_count"] += result.facility_count
                data[key]["outreach_count"] += result.outreach_count

                # Convert administered_date to string format
                date_key = (
                    result.administered_date.strftime("%Y-%m-%d")
                    if result.administered_date
                    else None
                )
                if date_key:
                    data[key][date_key] = {
                        "facility_count": result.facility_count,
                        "outreach_count": result.outreach_count,
                        "total": result.total_count,
                    }

    return data


def format_data(data: Dict[tuple, Dict[str, Any]]) -> List[Dict[str, Any]]:
    formatted_data = list(data.values())
    formatted_data.sort(key=lambda x: (x["antigen"], x["ageGroup"]))

    # Add additional information
    for item in formatted_data:
        item["defaulter_count"] = 0  # Initialize defaulter count
        daily_data = {
            k: v
            for k, v in item.items()
            if isinstance(k, str)
            and k
            not in ["antigen", "ageGroup", "total", "facility_count", "outreach_count"]
        }

        # Calculate defaulter count from daily data
        for day_data in daily_data.values():
            if isinstance(day_data, dict):
                item["defaulter_count"] += day_data.get("total", 0)

    return formatted_data


def moh_710_report(filters: Dict[str, str]) -> List[Dict[str, Any]]:
    """Generate MOH 710 report with immunization data"""
    try:
        facility_code = filters.get("facility")
        country = filters.get("country")
        county = filters.get("county")
        subcounty = filters.get("subcounty")
        start_date = parse_date(filters.get("start_date"))
        end_date = parse_date(filters.get("end_date"))

        query = build_query(
            facility_code, country, county, subcounty, start_date, end_date
        )
        results = query.all()

        data = process_results(results)
        formatted_data = format_data(data)

        # Add metadata to the report
        report_metadata = {
            "report_period": f"{start_date} to {end_date}",
            "facility": facility_code,
            "county": county,
            "subcounty": subcounty,
            "total_records": sum(item["total"] for item in formatted_data),
            "total_facility": sum(item["facility_count"] for item in formatted_data),
            "total_outreach": sum(item["outreach_count"] for item in formatted_data),
            "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }

        return {"metadata": report_metadata, "data": formatted_data}

    except Exception as e:
        db.session.rollback()
        raise Exception(f"Error generating MOH 710 report: {str(e)}")
