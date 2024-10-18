from configs import db
from models.dataset import PrimaryImmunizationDataset
from sqlalchemy import or_


def to_dict(data):
    return [row.__dict__ for row in data]


def to_json(data):
    results_dict = to_dict(data)
    for result in results_dict:
        result.pop("_sa_instance_state")
    return results_dict


def insert_data(data):
    PrimaryImmunizationDataset.query.delete()
    db.session.commit()
    for row in data:
        print(row)
        db.session.add(PrimaryImmunizationDataset(**row))
    db.session.commit()


from sqlalchemy import or_, desc
from typing import Dict, Any, Optional

def query_defaulters(
    name: str = "",
    facility: str = "",
    vaccine_name: str = "",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = 1,
    per_page: int = 20
) -> Dict[str, Any]:
    query = build_base_query(name, facility, vaccine_name)
    query = apply_date_filter(query, start_date, end_date)
    query = apply_sorting(query)

    
    total_records = query.count()
    if total_records == 0:
        return create_empty_result(page, per_page)
    
    page, offset = calculate_pagination(page, per_page, total_records)
    data = query.limit(per_page).offset(offset).all()
    
    return create_result(data, total_records, page, per_page)

def build_base_query(name: str, facility: str, vaccine_name: str):
    return PrimaryImmunizationDataset.query.filter(
        or_(
            PrimaryImmunizationDataset.family_name.ilike(f"%{name}%"),
            PrimaryImmunizationDataset.given_name.ilike(f"%{name}%"),
            PrimaryImmunizationDataset.vaccine_name.ilike(f"%{vaccine_name}%"),
            PrimaryImmunizationDataset.facility.ilike(f"%{facility}%"),
        ),
        PrimaryImmunizationDataset.imm_status == "Missed Immunization",
        PrimaryImmunizationDataset.imm_status_defaulter == 'Yes',
        PrimaryImmunizationDataset.vaccine_category == 'routine',
        PrimaryImmunizationDataset.occ_date.is_(None)
    )

def apply_date_filter(query, start_date: Optional[str], end_date: Optional[str]):
    if start_date and end_date:
        return query.filter(
            PrimaryImmunizationDataset.occ_date >= start_date,
            PrimaryImmunizationDataset.occ_date <= end_date
        )
    return query

def apply_sorting(query):
    return query.order_by(desc(PrimaryImmunizationDataset.due_date))

def calculate_pagination(page: int, per_page: int, total_records: int) -> tuple[int, int]:
    page = max(1, page)
    offset = (page - 1) * per_page
    if offset >= total_records:
        page = 1
        offset = 0
    return page, offset

def create_empty_result(page: int, per_page: int) -> Dict[str, Any]:
    return {
        "data": [],
        "total_records": 0,
        "total_pages": 0,
        "current_page": page,
        "per_page": per_page
    }

def create_result(data: list, total_records: int, page: int, per_page: int) -> Dict[str, Any]:
    return {
        "data": to_json(data),
        "total_records": total_records,
        "total_pages": (total_records + per_page - 1) // per_page,
        "current_page": page,
        "per_page": per_page
    }

def insert_data(data):
    # insert data into the database (an array of objects)
    for row in data:
        db.session.add(PrimaryImmunizationDataset(**row))
    db.session.commit()
    return "Data inserted successfully"

