from models.dataset import PrimaryImmunizationDataset
from datetime import datetime, timedelta
from helpers import to_json


def moh_710_report(filters):
    report_data = PrimaryImmunizationDataset.query.filter(
        PrimaryImmunizationDataset.facility.ilike(f"%{filters.get('facility', '')}%"),
        PrimaryImmunizationDataset.county.ilike(f"%{filters.get('county', '')}%"),
        PrimaryImmunizationDataset.sub_county.ilike(
            f"%{filters.get('sub_county', '')}%"
        ),
        PrimaryImmunizationDataset.ward.ilike(f"%{filters.get('ward', '')}%"),
        PrimaryImmunizationDataset.occ_date
        >= filters.get("start_date", datetime.now() - timedelta(days=365)),
        PrimaryImmunizationDataset.occ_date <= filters.get("end_date", datetime.now()),
    ).all()

    return to_json(report_data)
