from sqlalchemy import func, literal

from configs import db
from models.dataset import PrimaryImmunizationDataset


def moh_525_report():
    report_data = db.session.query(
        PrimaryImmunizationDataset.patient_update_date.label("date"),
        literal("*").label("serial_no"),  # Placeholder for Serial No (MOH 510)
        literal("*").label("child_number"),  # Placeholder for Child's Number
        func.concat(
            PrimaryImmunizationDataset.given_name,
            " ",
            PrimaryImmunizationDataset.family_name,
        ).label("name_of_child"),
        PrimaryImmunizationDataset.gender,
        PrimaryImmunizationDataset.age_m,
        func.concat(
            PrimaryImmunizationDataset.pat_relation_name,
            " ",
            PrimaryImmunizationDataset.family_name,
        ).label("name_of_parent_or_caregiver"),
        PrimaryImmunizationDataset.pat_relation_tel,
        literal("*").label(
            "name_of_village_or_estate_or_landmark"
        ),  # Placeholder for Name of Village/Estate/Landmark
        PrimaryImmunizationDataset.vaccine_name.label("vaccines_missed"),
        literal("").label("traced_yes_no"),  # Placeholder for Traced Yes/No\
        literal("").label("outcome"),  # Placeholder for Outcome
        literal("").label("remarks"),  # Placeholder for Remarks
    ).all()

    def map_result_to_dict(row):
        return {
            "date": row.date,
            "serial_no": row.serial_no,
            "child_number": row.child_number,
            "name_of_child": row.name_of_child,
            "gender": row.gender,
            "age_m": row.age_m,
            "name_of_parent_or_caregiver": row.name_of_parent_or_caregiver,
            "pat_relation_tel": row.pat_relation_tel,
            "name_of_village_or_estate_or_landmark": row.name_of_village_or_estate_or_landmark,
            "vaccines_missed": row.vaccines_missed,
            "traced_yes_no": row.traced_yes_no,
            "outcome": row.outcome,
            "remarks": row.remarks,
        }

    report_data = [map_result_to_dict(row) for row in report_data]
    return report_data
