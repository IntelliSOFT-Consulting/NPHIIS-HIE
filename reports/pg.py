from configs import db
from models.dataset import PrimaryImmunizationDataset
from sqlalchemy import or_, desc, and_
from typing import Dict, Any, Optional, List
from datetime import datetime


def to_dict(data: List[Any]) -> List[Dict]:
    """Convert SQLAlchemy objects to dictionaries"""
    return [row.__dict__ for row in data]


def to_json(data: List[Any]) -> List[Dict]:
    """Convert SQLAlchemy objects to JSON-serializable dictionaries"""
    results_dict = to_dict(data)
    for result in results_dict:
        result.pop("_sa_instance_state", None)
        # Convert datetime objects to strings
        for key, value in result.items():
            if isinstance(value, datetime):
                result[key] = value.isoformat()
    return results_dict


def query_defaulters(
    name: str = "",
    facility: str = "",
    vaccine_name: str = "",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = 1,
    per_page: int = 20,
) -> Dict[str, Any]:
    """Query defaulters with pagination"""
    try:
        query = build_base_query(name, facility, vaccine_name)
        query = apply_date_filter(query, start_date, end_date)
        query = apply_sorting(query)

        total_records = query.count()
        if total_records == 0:
            return create_empty_result(page, per_page)

        page, offset = calculate_pagination(page, per_page, total_records)
        data = query.limit(per_page).offset(offset).all()

        return create_result(data, total_records, page, per_page)
    except Exception as e:
        db.session.rollback()
        raise Exception(f"Error querying defaulters: {str(e)}")


def build_base_query(name: str, facility: str, vaccine_name: str):
    """Build base query with filters"""
    return PrimaryImmunizationDataset.query.filter(
        and_(
            or_(
                PrimaryImmunizationDataset.family_name.ilike(f"%{name}%"),
                PrimaryImmunizationDataset.given_name.ilike(f"%{name}%"),
                PrimaryImmunizationDataset.vaccine_name.ilike(f"%{vaccine_name}%"),
                PrimaryImmunizationDataset.facility_name.ilike(f"%{facility}%"),
            ),
            PrimaryImmunizationDataset.immunization_status
            == "Not Administered",  # Updated status
            PrimaryImmunizationDataset.is_defaulter == True,  # Updated defaulter check
            PrimaryImmunizationDataset.vaccine_category == "routine",
            PrimaryImmunizationDataset.administered_date.is_(
                None
            ),  # Updated date field
            PrimaryImmunizationDataset.is_active == True,  # Added active check
            PrimaryImmunizationDataset.is_deceased == False,  # Added deceased check
        )
    )


def apply_date_filter(query, start_date: Optional[str], end_date: Optional[str]):
    """Apply date range filter"""
    if start_date and end_date:
        try:
            start = datetime.strptime(start_date, "%Y-%m-%d")
            end = datetime.strptime(end_date, "%Y-%m-%d")
            return query.filter(
                PrimaryImmunizationDataset.schedule_due_date >= start,
                PrimaryImmunizationDataset.schedule_due_date <= end,
            )
        except ValueError:
            raise ValueError("Invalid date format. Use YYYY-MM-DD")
    return query


def apply_sorting(query):
    """Apply sorting to query"""
    return query.order_by(
        desc(PrimaryImmunizationDataset.schedule_due_date),
        desc(PrimaryImmunizationDataset.defaulter_days),
    )


def calculate_pagination(
    page: int, per_page: int, total_records: int
) -> tuple[int, int]:
    """Calculate pagination parameters"""
    page = max(1, page)
    offset = (page - 1) * per_page
    if offset >= total_records:
        page = 1
        offset = 0
    return page, offset


def create_empty_result(page: int, per_page: int) -> Dict[str, Any]:
    """Create empty result structure"""
    return {
        "data": [],
        "total_records": 0,
        "total_pages": 0,
        "current_page": page,
        "per_page": per_page,
        "metadata": {
            "generated_at": datetime.now().isoformat(),
            "filters_applied": False,
        },
    }


def create_result(
    data: list, total_records: int, page: int, per_page: int
) -> Dict[str, Any]:
    """Create result structure with metadata"""
    return {
        "data": to_json(data),
        "total_records": total_records,
        "total_pages": (total_records + per_page - 1) // per_page,
        "current_page": page,
        "per_page": per_page,
        "metadata": {
            "generated_at": datetime.now().isoformat(),
            "filters_applied": True,
            "defaulter_summary": {
                "total_defaulters": total_records,
                "by_vaccine_category": summarize_by_vaccine_category(data),
                "by_age_group": summarize_by_age_group(data),
            },
        },
    }


def summarize_by_vaccine_category(data: List[Any]) -> Dict[str, int]:
    """Summarize defaulters by vaccine category"""
    summary = {}
    for record in data:
        category = record.vaccine_category
        if category not in summary:
            summary[category] = 0
        summary[category] += 1
    return summary


def summarize_by_age_group(data: List[Any]) -> Dict[str, int]:
    """Summarize defaulters by age group"""
    summary = {}
    for record in data:
        age_group = record.age_group
        if age_group not in summary:
            summary[age_group] = 0
        summary[age_group] += 1
    return summary


def insert_data(data: List[Dict]) -> str:
    """Insert data into database with validation and error handling"""
    try:
        for row in data:
            # Convert string dates to datetime objects
            for date_field in [
                "administered_date",
                "schedule_due_date",
                "birth_date",
                "patient_last_updated",
            ]:
                if row.get(date_field):
                    try:
                        if isinstance(row[date_field], str):
                            row[date_field] = datetime.fromisoformat(
                                row[date_field].replace("Z", "+00:00")
                            )
                    except ValueError:
                        row[date_field] = None

            # Ensure boolean fields are proper booleans
            for bool_field in [
                "is_active",
                "is_deceased",
                "is_multiple_birth",
                "is_defaulter",
            ]:
                if bool_field in row:
                    row[bool_field] = bool(row[bool_field])

            db.session.add(PrimaryImmunizationDataset(**row))

        db.session.commit()
        return "Data inserted successfully"
    except Exception as e:
        db.session.rollback()
        raise Exception(f"Error inserting data: {str(e)}")
