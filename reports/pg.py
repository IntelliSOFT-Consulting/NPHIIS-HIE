from datetime import datetime, timedelta
from configs import db
from models.dataset import PrimaryImmunizationDataset


def insert_data(data):
    PrimaryImmunizationDataset.query.delete()
    db.session.commit()
    for row in data:
        db.session.add(PrimaryImmunizationDataset(**row))
    db.session.commit()


def query_defaulters(name="", vaccine_name="", start_date="", end_date=""):
    if start_date and end_date:
        data = PrimaryImmunizationDataset.query.filter(
            PrimaryImmunizationDataset.family_name.ilike(f"%{name}%"),
            PrimaryImmunizationDataset.vaccine_name.ilike(f"%{vaccine_name}%"),
            PrimaryImmunizationDataset.occ_date >= start_date,
            PrimaryImmunizationDataset.occ_date <= end_date,
        ).all()
        return [row.to_dict() for row in data]
    else:
        data = PrimaryImmunizationDataset.query.filter(
            PrimaryImmunizationDataset.family_name.ilike(f"%{name}%"),
            PrimaryImmunizationDataset.vaccine_name.ilike(f"%{vaccine_name}%"),
        ).all()
        return [row.to_dict() for row in data]
