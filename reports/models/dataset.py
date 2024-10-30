from configs import db
from sqlalchemy.orm import Mapped
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime, date


class PrimaryImmunizationDataset(db.Model):
    """Primary immunization dataset tracking patient vaccinations and schedules"""

    __tablename__ = "primary_immunization_dataset"

    # Primary Key
    id: Mapped[int] = db.Column(db.Integer, primary_key=True)

    # Patient Identification
    patient_id: Mapped[str] = db.Column(db.String(50), nullable=False, index=True)
    document_id: Mapped[str] = db.Column(db.String(50), index=True)
    document_type: Mapped[str] = db.Column(db.String(50), index=True)

    # Patient Demographics
    family_name: Mapped[str] = db.Column(db.String(100))
    given_name: Mapped[str] = db.Column(db.String(100))
    birth_date: Mapped[date] = db.Column(db.Date)
    gender: Mapped[str] = db.Column(db.String(20))
    age_years: Mapped[int] = db.Column(db.Integer)
    age_months: Mapped[int] = db.Column(db.Integer)
    age_group: Mapped[str] = db.Column(db.String(50))

    # Patient Status
    is_active: Mapped[bool] = db.Column(db.Boolean, default=True)
    is_deceased: Mapped[bool] = db.Column(db.Boolean, default=False)
    is_multiple_birth: Mapped[bool] = db.Column(db.Boolean)

    # Contact Information
    phone_primary: Mapped[str] = db.Column(db.String(50))
    phone_secondary: Mapped[str] = db.Column(db.String(50))

    # Guardian/Emergency Contact
    guardian_relationship: Mapped[str] = db.Column(db.String(50))
    guardian_name: Mapped[str] = db.Column(db.String(100))
    guardian_phone: Mapped[str] = db.Column(db.String(50))

    # Location Information
    county: Mapped[str] = db.Column(db.String(100), index=True)
    subcounty: Mapped[str] = db.Column(db.String(100), index=True)
    ward: Mapped[str] = db.Column(db.String(100))
    facility_name: Mapped[str] = db.Column(db.String(500), nullable=True)
    facility_code: Mapped[str] = db.Column(db.String(50), nullable=True)

    # Vaccination Details
    vaccine_code: Mapped[str] = db.Column(db.String(50), index=True)
    vaccine_name: Mapped[str] = db.Column(db.String(100))
    vaccine_category: Mapped[str] = db.Column(db.String(50))
    dose_number: Mapped[int] = db.Column(db.Integer)
    series_name: Mapped[str] = db.Column(db.String(100))

    # Schedule Information
    schedule_due_date: Mapped[str] = db.Column(db.DateTime)
    administered_date: Mapped[str] = db.Column(db.DateTime, nullable=True)
    days_from_due_date: Mapped[int] = db.Column(db.Integer, nullable=True)

    # Administration Details
    administration_location: Mapped[str] = db.Column(db.String(200))
    batch_number: Mapped[str] = db.Column(db.String(50))

    # Status Tracking
    immunization_status: Mapped[str] = db.Column(db.String(50), index=True)
    is_defaulter: Mapped[bool] = db.Column(db.Boolean, index=True)
    defaulter_days: Mapped[int] = db.Column(db.Integer, nullable=True)

    # Disease Prevention
    target_disease: Mapped[str] = db.Column(db.String(200))
    disease_category: Mapped[str] = db.Column(db.String(100))

    # Metadata
    record_created_at: Mapped[datetime] = db.Column(
        db.DateTime, default=datetime.utcnow
    )
    record_updated_at: Mapped[datetime] = db.Column(
        db.DateTime, onupdate=datetime.utcnow
    )
    patient_last_updated: Mapped[datetime] = db.Column(db.DateTime)
    data_source: Mapped[str] = db.Column(db.String(50))
