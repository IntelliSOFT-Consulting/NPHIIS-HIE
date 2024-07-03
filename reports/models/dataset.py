from configs import db


class PrimaryImmunizationDataset(db.Model):
    __tablename__ = "primary_immunization_dataset"
    id: db.Column = db.Column(db.Integer, primary_key=True)
    patient_id: db.Column = db.Column(db.String, nullable=True)
    family_name: db.Column = db.Column(db.String, nullable=True)
    given_name: db.Column = db.Column(db.String, nullable=True)
    national_id: db.Column = db.Column(db.String, nullable=True)
    patient_update_date: db.Column = db.Column(db.String, nullable=True)
    phone: db.Column = db.Column(db.String, nullable=True)
    gender: db.Column = db.Column(db.String, nullable=True)
    birth_date: db.Column = db.Column(db.String, nullable=True)
    the_age: db.Column = db.Column(db.String, nullable=True)
    age_y: db.Column = db.Column(db.Integer, nullable=True)
    age_m: db.Column = db.Column(db.Integer, nullable=True)
    age_group: db.Column = db.Column(db.String, nullable=True)
    active: db.Column = db.Column(db.Boolean, nullable=True)
    deceased: db.Column = db.Column(db.Boolean, nullable=True)
    marital_status: db.Column = db.Column(db.String, nullable=True)
    multiple_birth: db.Column = db.Column(db.Boolean, nullable=True)
    pat_relation: db.Column = db.Column(db.String, nullable=True)
    pat_relation_name: db.Column = db.Column(db.String, nullable=True)
    pat_relation_tel: db.Column = db.Column(db.String, nullable=True)
    due_date: db.Column = db.Column(db.String, nullable=True)
    county: db.Column = db.Column(db.String, nullable=True)
    subcounty: db.Column = db.Column(db.String, nullable=True)
    ward: db.Column = db.Column(db.String, nullable=True)
    facility: db.Column = db.Column(db.String, nullable=True)
    facility_code: db.Column = db.Column(db.String, nullable=True)
    the_vaccine_seq: db.Column = db.Column(db.Integer, nullable=True)
    vaccine_code: db.Column = db.Column(db.String, nullable=True)
    vaccine_name: db.Column = db.Column(db.String, nullable=True)
    vaccine_category: db.Column = db.Column(db.String, nullable=True)
    the_dose: db.Column = db.Column(db.Integer, nullable=True)
    description: db.Column = db.Column(db.String, nullable=True)
    series: db.Column = db.Column(db.String, nullable=True)
    occ_date: db.Column = db.Column(db.String, nullable=True)
    days_from_due: db.Column = db.Column(db.Integer, nullable=True)
    faci_outr: db.Column = db.Column(db.String, nullable=True)
    imm_status: db.Column = db.Column(db.String, nullable=True)
    imm_status_defaulter: db.Column = db.Column(db.String, nullable=True)


def to_dict(self):
    return {
        "patient_id": self.patient_id,
        "family_name": self.family_name,
        "given_name": self.given_name,
        "national_id": self.national_id,
        "patient_update_date": self.patient_update_date,
        "phone": self.phone,
        "gender": self.gender,
        "birth_date": self.birth_date,
        "the_age": self.the_age,
        "age_y": self.age_y,
        "age_m": self.age_m,
        "age_group": self.age_group,
        "active": self.active,
        "deceased": self.deceased,
        "marital_status": self.marital_status,
        "multiple_birth": self.multiple_birth,
        "pat_relation": self.pat_relation,
        "pat_relation_name": self.pat_relation_name,
        "pat_relation_tel": self.pat_relation_tel,
        "due_date": self.due_date,
        "county": self.county,
        "subcounty": self.subcounty,
        "ward": self.ward,
        "facility": self.facility,
        "facility_code": self.facility_code,
        "the_vaccine_seq": self.the_vaccine_seq,
        "vaccine_code": self.vaccine_code,
        "vaccine_name": self.vaccine_name,
        "vaccine_category": self.vaccine_category,
        "the_dose": self.the_dose,
        "description": self.description,
        "series": self.series,
        "occ_date": self.occ_date,
        "days_from_due": self.days_from_due,
        "faci_outr": self.faci_outr,
        "imm_status": self.imm_status,
        "imm_status_defaulter": self.imm_status_defaulter,
    }
