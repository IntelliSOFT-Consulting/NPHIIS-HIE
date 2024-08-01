from configs import db
from models.dataset import PrimaryImmunizationDataset


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


def query_defaulters(name="", facility="", vaccine_name="", start_date="", end_date=""):
    if start_date and end_date:
        data = PrimaryImmunizationDataset.query.filter(
            PrimaryImmunizationDataset.family_name.ilike(f"%{name}%"),
            PrimaryImmunizationDataset.vaccine_name.ilike(f"%{vaccine_name}%"),
            PrimaryImmunizationDataset.occ_date >= start_date,
            PrimaryImmunizationDataset.occ_date <= end_date,
            PrimaryImmunizationDataset.imm_status == "Defaulter",
            PrimaryImmunizationDataset.facility.ilike(f"%{facility}%"),
        ).all()
        return to_json(data)
    else:
        data = PrimaryImmunizationDataset.query.filter(
            PrimaryImmunizationDataset.family_name.ilike(f"%{name}%"),
            PrimaryImmunizationDataset.vaccine_name.ilike(f"%{vaccine_name}%"),
            PrimaryImmunizationDataset.imm_status == "Defaulter",
            PrimaryImmunizationDataset.facility.ilike(f"%{facility}%"),
        ).all()
        return to_json(data)
