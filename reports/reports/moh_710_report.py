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

    facility_filter = PrimaryImmunizationDataset.facility_code == facility_code

    if country:
        facility_filter = PrimaryImmunizationDataset.county.ilike("")
    elif county:
        facility_filter = PrimaryImmunizationDataset.county.ilike(f"%{county}%")
    elif subcounty:
        facility_filter = PrimaryImmunizationDataset.subcounty.ilike(f"%{subcounty}%")

    return (
        db.session.query(
            PrimaryImmunizationDataset.occ_date,
            PrimaryImmunizationDataset.vaccine_name,
            PrimaryImmunizationDataset.age_group,
            func.sum(
                case((PrimaryImmunizationDataset.faci_outr == "Facility", 1), else_=0)
            ).label("facility_count"),
            func.sum(
                case((PrimaryImmunizationDataset.faci_outr == "Outreach", 1), else_=0)
            ).label("outreach_count"),
            func.count().label("total_count"),
        )
        .filter(
            and_(
                facility_filter,
                PrimaryImmunizationDataset.occ_date.between(start_date, end_date),
                PrimaryImmunizationDataset.age_group.in_(
                    ["Under 1 Year", "Above 1 Year"]
                ),
            )
        )
        .group_by(
            PrimaryImmunizationDataset.occ_date,
            PrimaryImmunizationDataset.vaccine_name,
            PrimaryImmunizationDataset.age_group,
        )
        .order_by(
            PrimaryImmunizationDataset.occ_date,
            PrimaryImmunizationDataset.vaccine_name,
            PrimaryImmunizationDataset.age_group,
        )
    )


def process_results(results: List[Any]) -> Dict[tuple, Dict[str, Any]]:
    data = defaultdict(
        lambda: {
            "antigen": "",
            "ageGroup": "Under 1 Year",
            "total": 0,
            "facility_count": 0,
            "outreach_count": 0,
        }
    )

    for result in results:
        for age_group in ["Under 1 Year", "Above 1 Year"]:
            key = (result.vaccine_name, age_group)
            if not data[key]["antigen"]:
                data[key]["antigen"] = result.vaccine_name
                data[key]["ageGroup"] = age_group

            if data[key]["ageGroup"] == result.age_group:
                data[key]["total"] += result.total_count
                data[key]["facility_count"] += result.facility_count
                data[key]["outreach_count"] += result.outreach_count

                data[key][result.occ_date] = {
                    "facility_count": result.facility_count,
                    "outreach_count": result.outreach_count,
                    "total": result.total_count,
                }

    return data


def format_data(data: Dict[tuple, Dict[str, Any]]) -> List[Dict[str, Any]]:
    formatted_data = list(data.values())
    formatted_data.sort(key=lambda x: (x["antigen"], x["ageGroup"]))
    return formatted_data


def moh_710_report(filters: Dict[str, str]) -> List[Dict[str, Any]]:
    facility_code = filters.get("facility_code")
    country = filters.get("country")
    county = filters.get("county")
    subcounty = filters.get("subcounty")
    start_date = parse_date(filters.get("start_date"))
    end_date = parse_date(filters.get("end_date"))

    query = build_query(facility_code, country, county, subcounty, start_date, end_date)
    results = query.all()

    data = process_results(results)
    formatted_data = format_data(data)

    return formatted_data
