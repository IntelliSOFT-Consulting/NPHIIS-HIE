from models.dataset import PrimaryImmunizationDataset
from datetime import datetime, timedelta
from helpers import to_json

from sqlalchemy import func, or_
from configs import db


def moh_510_report():
    db.session.query(
        func.concat(PrimaryImmunizationDataset.family_name, " ", PrimaryImmunizationDataset.child_name).label("name"),
        PrimaryImmunizationDataset.patient_id,
        PrimaryImmunizationDataset.due_date,
        PrimaryImmunizationDataset.gender,
        PrimaryImmunizationDataset.birth_date,
        PrimaryImmunizationDataset.pat_relation_name,
        PrimaryImmunizationDataset.pat_relation_tel,
        PrimaryImmunizationDataset.age_m,
        PrimaryImmunizationDataset.occ_date,
    ).filter().all()