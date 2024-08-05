from models.dataset import PrimaryImmunizationDataset
from datetime import datetime, timedelta
from helpers import to_json

from sqlalchemy import func, or_
from configs import db


def moh_710_report(filters):
    facility = filters.get("facility")
    facility_code = filters.get("facility_code")

    ward = filters.get("ward")
    county = filters.get("county")
    subcounty = filters.get("subcounty")
    
    start_date = filters.get("start_date")
    end_date = filters.get("end_date")

    moh_710_report_query = (
        db.session.query(
            PrimaryImmunizationDataset.facility,
            PrimaryImmunizationDataset.facility_code,
            PrimaryImmunizationDataset.ward,
            PrimaryImmunizationDataset.county,
            PrimaryImmunizationDataset.subcounty,
            PrimaryImmunizationDataset.vaccine_name,
            PrimaryImmunizationDataset.age_group,
            PrimaryImmunizationDataset.occ_date,
            func.count(PrimaryImmunizationDataset.id).label("count"),
        )
        .filter(
            or_(
                PrimaryImmunizationDataset.facility.ilike(f"%{facility}%"),
                PrimaryImmunizationDataset.facility_code.ilike(f"%{facility_code}%"),
                PrimaryImmunizationDataset.ward.ilike(f"%{ward}%"),
                PrimaryImmunizationDataset.county.ilike(f"%{county}%"),
                PrimaryImmunizationDataset.subcounty.ilike(f"%{subcounty}%"),
            ),
            PrimaryImmunizationDataset.occ_date >= start_date,
            PrimaryImmunizationDataset.occ_date <= end_date,
        )
        .group_by(
            PrimaryImmunizationDataset.facility,
            PrimaryImmunizationDataset.facility_code,
            PrimaryImmunizationDataset.ward,
            PrimaryImmunizationDataset.county,
            PrimaryImmunizationDataset.subcounty,
            PrimaryImmunizationDataset.vaccine_name,
            PrimaryImmunizationDataset.age_group,
            PrimaryImmunizationDataset.occ_date,
        )
    )

    report_data = moh_710_report_query.all()

    def map_result_to_dict(row):
        return {
            "facility": row.facility,
            "facility_code": row.facility_code,
            "ward": row.ward,
            "county": row.county,
            "subcounty": row.subcounty,
            "occ_date": row.occ_date,
            "vaccine_name": row.vaccine_name,
            "age_group": row.age_group,
            "count": row.count,
        }

    report_data = [map_result_to_dict(row) for row in report_data]
    return report_data
