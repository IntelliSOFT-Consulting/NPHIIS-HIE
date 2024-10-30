from pyhive import hive
from dotenv import load_dotenv
import os
import json
from datetime import datetime, date, timedelta
from typing import List, Dict, Any
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy import create_engine
import logging
import traceback
from configs import db, app
from models.dataset import PrimaryImmunizationDataset

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

load_dotenv()


class ImmunizationDataProcessor:
    def __init__(self):
        self.batch_size = 1000
        self.hive_host = os.getenv("HIVE_SERVER")
        self.hive_port = int(os.getenv("HIVE_PORT"))
        self.hive_database = "default"

    def get_hive_connection(self):
        """Get Hive connection"""
        try:
            return hive.connect(
                host=self.hive_host, port=self.hive_port, database=self.hive_database
            )
        except Exception as e:
            logger.error(f"Error establishing Hive connection: {e}")
            raise

    def execute_hive_query(self, query: str) -> List[Dict]:
        """Execute Hive query with proper connection management"""
        conn = None
        try:
            conn = self.get_hive_connection()
            with conn.cursor() as cursor:
                cursor.execute(query)
                columns = [desc[0] for desc in cursor.description]
                return [dict(zip(columns, row)) for row in cursor.fetchall()]
        except Exception as e:
            logger.error(f"Error executing Hive query: {e}")
            raise
        finally:
            if conn:
                conn.close()

    def fetch_data_from_hive(self) -> tuple:
        """Fetch all required data from Hive"""
        try:
            logger.info("Fetching data from Hive...")

            recommendations = self.execute_hive_query(
                "SELECT * FROM immunizationrecommendation"
            )
            patients = self.execute_hive_query("SELECT * FROM patient")
            immunizations = self.execute_hive_query("SELECT * FROM immunization")

            # Convert patients list to dictionary for faster lookups
            patients_dict = {p["id"]: p for p in patients}

            logger.info(
                f"Retrieved {len(recommendations)} recommendations, "
                f"{len(patients)} patients, and {len(immunizations)} immunizations"
            )

            return recommendations, patients_dict, immunizations
        except Exception as e:
            logger.error(f"Error fetching data from Hive: {e}")
            raise

    def parse_date(self, date_str: str) -> datetime:
        """Parse date string to datetime object"""
        if not date_str:
            return None
        try:
            if "T" in date_str:
                # Handle timezone if present
                date_str = date_str.split(".")[0]
                if "Z" in date_str:
                    date_str = date_str.replace("Z", "")
                return datetime.strptime(date_str, "%Y-%m-%dT%H:%M:%S")
            return datetime.strptime(date_str, "%Y-%m-%d")
        except (ValueError, TypeError) as e:
            logger.debug(f"Error parsing date {date_str}: {e}")
            return None

    def calculate_age(self, birth_date: datetime) -> tuple:
        """Calculate age in years and months"""
        if not birth_date:
            return None, None

        today = date.today()
        bdate = birth_date.date()
        years = today.year - bdate.year
        months = today.month - bdate.month

        if today.day < bdate.day:
            months -= 1
        if months < 0:
            years -= 1
            months += 12

        return years, months

    def validate_record(self, record: Dict) -> bool:
        """Validate a single record before insertion"""
        required_fields = ["patient_id", "vaccine_code", "vaccine_name"]

        try:
            # Check required fields
            for field in required_fields:
                if field not in record or record[field] is None:
                    logger.error(f"Missing required field: {field} in record: {record}")
                    return False

            # Validate date fields
            date_fields = [
                "administered_date",
                "birth_date",
                "schedule_due_date",
                "patient_last_updated",
            ]
            for field in date_fields:
                if field in record and record[field] is not None:
                    if not isinstance(record[field], (datetime, date)):
                        logger.error(f"Invalid date field {field}: {record[field]}")
                        return False

            # Validate boolean fields
            bool_fields = [
                "is_active",
                "is_deceased",
                "is_multiple_birth",
                "is_defaulter",
            ]
            for field in bool_fields:
                if field in record and record[field] is not None:
                    if not isinstance(record[field], bool):
                        logger.error(f"Invalid boolean field {field}: {record[field]}")
                        return False

            return True
        except Exception as e:
            logger.error(f"Error validating record: {e}")
            logger.error(f"Problematic record: {record}")
            return False

    def process_patient_data(self, patient_data: Dict) -> Dict:
        """Process patient information"""
        try:
            birth_date = self.parse_date(patient_data.get("birthDate").split("T")[0])
            age_years, age_months = self.calculate_age(birth_date)

            # Safely handle meta data and tags
            meta = json.loads(patient_data.get("meta", "{}"))
            tags = meta.get("tag", [])
            facility_info = tags[0] if tags else {}

            # Safely get patient name data
            name_data = (
                json.loads(patient_data.get("name", "[]"))[0]
                if patient_data.get("name")
                else {}
            )

            # Safely get identifier data
            identifier_data = next(
                (
                    item
                    for item in json.loads(patient_data.get("identifier", "[]"))
                    if item.get("value")
                    and item.get("type", {}).get("coding", [{}])[0].get("code", None)
                    != "estimated_age"
                ),
                None,
            )

            # Safely get address data
            address_list = json.loads(patient_data.get("address", "[]"))
            address_data = address_list[0] if address_list else {}

            # Safely get telecom data
            telecom_data = json.loads(patient_data.get("telecom", "[]"))

            # Safely get contact data
            contact_data = json.loads(patient_data.get("contact", "[]"))

            processed_data = {
                "patient_id": patient_data["id"],
                "family_name": name_data.get("family", ""),
                "given_name": " ".join(name_data.get("given", [])),
                "document_id": (
                    identifier_data.get("value", None) if identifier_data else None
                ),
                "document_type": (
                    identifier_data.get("type", {})
                    .get("coding", [{}])[0]
                    .get("display", None)
                    if identifier_data
                    else None
                ),
                "birth_date": birth_date,
                "gender": patient_data.get("gender"),
                "age_years": age_years,
                "age_months": age_months,
                "age_group": (
                    "Above 1 year" if age_years and age_years > 1 else "Below 1 year"
                ),
                "is_active": patient_data.get("active", True),
                "is_deceased": patient_data.get("deceasedBoolean", False),
                "is_multiple_birth": patient_data.get("multipleBirthBoolean", False),
                "county": address_data.get("city"),
                "subcounty": address_data.get("district"),
                "ward": address_data.get("state"),
                "facility_name": facility_info.get("display", "N/A"),
                "facility_code": (
                    facility_info.get("code", "").replace("Location/", "")
                    if facility_info.get("code")
                    else None
                ),
                "phone_primary": telecom_data[0].get("value") if telecom_data else None,
                "patient_last_updated": self.parse_date(meta.get("lastUpdated")),
                "guardian_relationship": None,
                "guardian_name": None,
                "guardian_phone": None,
                "phone_secondary": None,
            }

            # Process contact/guardian information
            for contact in contact_data:
                if "telecom" in contact and contact.get("telecom"):
                    relationship = contact.get("relationship", [{}])[0].get("text")
                    if relationship:
                        processed_data.update(
                            {
                                "guardian_relationship": relationship,
                                "guardian_name": contact.get("name", {}).get("text"),
                                "guardian_phone": contact["telecom"][0].get("value"),
                                "phone_secondary": contact["telecom"][0].get("value"),
                            }
                        )
                        break

            return processed_data
        except Exception as e:
            logger.error(
                f"Error processing patient data for ID {patient_data.get('id', 'unknown')}: {e}"
            )
            logger.error(traceback.format_exc())
            return {}

    def process_vaccine_data(
        self, vaccine: Dict, immunizations: List[Dict], patient_id: str
    ) -> Dict:
        """Process vaccine and immunization data"""
        try:
            vaccine_code = vaccine["vaccineCode"][0]["coding"][0]["code"]

            due_date = next(
                (
                    date["value"]
                    for date in vaccine["dateCriterion"]
                    if date["code"]["coding"][0]["code"]
                    == "Earliest-date-to-administer"
                ),
                None,
            )
            due_date = self.parse_date(due_date)

            processed_data = {
                "patient_id": patient_id,
                "vaccine_code": vaccine_code,
                "vaccine_name": vaccine["vaccineCode"][0]["text"],
                "target_disease": vaccine["targetDisease"]["text"],
                "vaccine_category": vaccine.get("description"),
                "series_name": vaccine.get("series"),
                "dose_number": vaccine.get("doseNumberPositiveInt", 0),
                "schedule_due_date": due_date,
                "disease_category": vaccine["targetDisease"]
                .get("text", "")
                .split(",")[0]
                .strip(),
                "administered_date": None,
                "days_from_due_date": None,
                "is_defaulter": False,
                "defaulter_days": None,
                "batch_number": None,
                "administration_location": "Not Administered",
                "immunization_status": "Not Administered",
            }

            # Match with administered immunization
            matching_immunization = immunizations[0] if immunizations else None

            if matching_immunization:
                administered_date = self.parse_date(
                    matching_immunization.get("recorded")
                )
                days_from_due = None

                if administered_date and due_date:
                    days_from_due = (administered_date.date() - due_date.date()).days
                    processed_data.update(
                        {
                            "administered_date": administered_date,
                            "days_from_due_date": days_from_due,
                            "is_defaulter": days_from_due > 14,
                            "defaulter_days": days_from_due,
                            "immunization_status": matching_immunization["status"],
                            "batch_number": matching_immunization.get("lotNumber"),
                            "administration_location": json.loads(
                                matching_immunization.get("note", "[{}]")
                            )[0].get("text", "Facility"),
                        }
                    )
            elif due_date:
                days_from_due = (datetime.now().date() - due_date.date()).days
                processed_data.update(
                    {
                        "is_defaulter": days_from_due > 14,
                        "defaulter_days": days_from_due,
                    }
                )

            return processed_data
        except Exception as e:
            logger.error(f"Error processing vaccine data for patient {patient_id}: {e}")
            logger.error(traceback.format_exc())
            return {}

    def bulk_insert_data(self, data: List[Dict]) -> None:
        """Bulk insert data with conflict resolution"""
        try:
            if not data:
                return

            # Clean and standardize data for insertion
            cleaned_data = []
            for record in data:
                try:
                    cleaned_record = {}
                    for key, value in record.items():
                        # Handle date/datetime objects
                        if isinstance(value, date) and not isinstance(value, datetime):
                            value = datetime.combine(value, datetime.min.time())
                        # Convert any None values in boolean fields to False
                        if (
                            key
                            in [
                                "is_active",
                                "is_deceased",
                                "is_multiple_birth",
                                "is_defaulter",
                            ]
                            and value is None
                        ):
                            value = False
                        # Ensure all date fields are either datetime or None
                        if (
                            key
                            in [
                                "administered_date",
                                "birth_date",
                                "schedule_due_date",
                                "patient_last_updated",
                            ]
                            and value is not None
                        ):
                            if isinstance(value, date):
                                value = datetime.combine(value, datetime.min.time())
                        cleaned_record[key] = value
                    cleaned_data.append(cleaned_record)
                except Exception as e:
                    logger.error(f"Error cleaning record: {e}")
                    logger.error(f"Problematic record: {record}")
                    continue

            if not cleaned_data:
                logger.warning("No valid records to insert after cleaning")
                return

            # add the cleaned data to a txt file line by line
            with open("cleaned_data.txt", "w") as file:
                for record in cleaned_data:
                    file.write(str(record) + "\n")

            stmt = insert(PrimaryImmunizationDataset).values(cleaned_data)

            with app.app_context():
                try:
                    db.session.execute(stmt)
                    db.session.commit()
                    logger.info(f"Successfully inserted {len(cleaned_data)} records")
                except Exception as e:
                    logger.error(f"Database error: {str(e)}")
                    logger.error(f"Full error traceback: {traceback.format_exc()}")
                    db.session.rollback()
                    raise
        except Exception as e:
            logger.error(f"Error in bulk_insert_data: {str(e)}")
            logger.error(f"Full traceback: {traceback.format_exc()}")
            with app.app_context():
                db.session.rollback()
            raise

    def process_data(self) -> str:
        """Main processing function with progress tracking"""
        start_time = datetime.now()
        logger.info("Starting data processing...")
        total_processed = 0

        try:
            with app.app_context():
                # Fetch all required data
                recommendations, patients, immunizations = self.fetch_data_from_hive()
                total_recommendations = len(recommendations)
                logger.info(f"Processing {total_recommendations} recommendations...")
                processed_records = []
                skipped_records = 0
                invalid_records = 0

                # Convert immunizations to a dictionary for faster lookup
                immunizations_dict = {}
                for imm in immunizations:
                    try:
                        patient_ref = json.loads(imm["patient"])["reference"].split(
                            "/"
                        )[1]
                        vaccine_code = json.loads(imm["vaccineCode"])["coding"][0][
                            "code"
                        ]
                        key = f"{patient_ref}_{vaccine_code}"
                        immunizations_dict[key] = imm
                    except Exception as e:
                        logger.error(f"Error processing immunization: {e}")
                        continue

                for count, recommendation in enumerate(recommendations, 1):
                    try:
                        if count % 100 == 0:
                            logger.info(
                                f"Processed {count}/{total_recommendations} recommendations"
                            )

                        patient_id = json.loads(recommendation["patient"])[
                            "reference"
                        ].split("/")[1]
                        patient_data = patients.get(patient_id)

                        if not patient_data:
                            skipped_records += 1
                            logger.warning(
                                f"Skipped record - Patient {patient_id} not found"
                            )
                            continue

                        base_data = self.process_patient_data(patient_data)

                        if not base_data:
                            invalid_records += 1
                            logger.warning(
                                f"Invalid record - Failed to process patient data for {patient_id}"
                            )
                            continue

                        try:
                            recommendations_list = json.loads(
                                recommendation["recommendation"]
                            )
                        except json.JSONDecodeError as e:
                            logger.error(
                                f"Error decoding recommendation JSON for patient {patient_id}: {e}"
                            )
                            continue

                        for vaccine in recommendations_list:
                            try:
                                vaccine_code = vaccine["vaccineCode"][0]["coding"][0][
                                    "code"
                                ]
                                matching_immunization = immunizations_dict.get(
                                    f"{patient_id}_{vaccine_code}"
                                )

                                vaccine_data = self.process_vaccine_data(
                                    vaccine,
                                    (
                                        [matching_immunization]
                                        if matching_immunization
                                        else []
                                    ),
                                    patient_id,
                                )

                                if vaccine_data:
                                    current_time = datetime.utcnow()
                                    record = {
                                        **base_data,
                                        **vaccine_data,
                                        "record_created_at": current_time,
                                        "record_updated_at": current_time,
                                        "data_source": "HIVE",
                                    }

                                    if self.validate_record(record):
                                        processed_records.append(record)
                                        total_processed += 1
                                    else:
                                        invalid_records += 1
                                        logger.warning(
                                            f"Invalid record format for patient {patient_id}"
                                        )
                                else:
                                    invalid_records += 1
                                    logger.warning(
                                        f"Failed to process vaccine data for patient {patient_id}"
                                    )

                                # Batch insert when we reach batch_size
                                if len(processed_records) >= self.batch_size:
                                    try:
                                        logger.info(
                                            f"Inserting batch of {len(processed_records)} records..."
                                        )
                                        self.bulk_insert_data(processed_records)
                                        processed_records = []
                                    except Exception as e:
                                        logger.error(f"Error in batch insert: {e}")
                                        logger.error(traceback.format_exc())
                                        invalid_records += len(processed_records)
                                        processed_records = []

                            except Exception as e:
                                logger.error(
                                    f"Error processing vaccine for patient {patient_id}: {e}"
                                )
                                logger.error(traceback.format_exc())
                                invalid_records += 1
                                continue

                    except Exception as e:
                        logger.error(f"Error processing recommendation: {e}")
                        logger.error(traceback.format_exc())
                        invalid_records += 1
                        continue

                # Insert any remaining records
                if processed_records:
                    try:
                        logger.info(
                            f"Inserting final batch of {len(processed_records)} records..."
                        )
                        self.bulk_insert_data(processed_records)
                    except Exception as e:
                        logger.error(f"Error in final batch insert: {e}")
                        logger.error(traceback.format_exc())
                        invalid_records += len(processed_records)

                end_time = datetime.now()
                processing_time = (end_time - start_time).total_seconds()

                result_message = (
                    f"Data processing completed successfully in {processing_time:.2f} seconds\n"
                    f"Total records processed: {total_processed}\n"
                    f"Skipped records: {skipped_records}\n"
                    f"Invalid records: {invalid_records}"
                )

                logger.info(result_message)
                return result_message

        except Exception as e:
            error_message = (
                f"Critical error in data processing: {e}\n{traceback.format_exc()}"
            )
            logger.error(error_message)
            return error_message


def clean_database():
    """Clean up duplicate or invalid records"""
    try:
        with app.app_context():
            # Delete records with NULL patient_id or vaccine_code
            deleted = (
                db.session.query(PrimaryImmunizationDataset)
                .filter(
                    db.or_(
                        PrimaryImmunizationDataset.patient_id.is_(None),
                        PrimaryImmunizationDataset.vaccine_code.is_(None),
                    )
                )
                .delete()
            )

            db.session.commit()
            logger.info(f"Cleaned up {deleted} invalid records")
            return f"Cleaned up {deleted} invalid records"
    except Exception as e:
        error_message = f"Error cleaning database: {e}"
        logger.error(error_message)
        return error_message


def get_processing_stats():
    """Get statistics about the processed data"""
    try:
        with app.app_context():
            total_patients = db.session.query(
                db.func.count(db.distinct(PrimaryImmunizationDataset.patient_id))
            ).scalar()
            total_records = db.session.query(
                db.func.count(PrimaryImmunizationDataset.id)
            ).scalar()
            defaulters = (
                db.session.query(db.func.count(PrimaryImmunizationDataset.id))
                .filter(PrimaryImmunizationDataset.is_defaulter.is_(True))
                .scalar()
            )
            not_administered = (
                db.session.query(db.func.count(PrimaryImmunizationDataset.id))
                .filter(PrimaryImmunizationDataset.administered_date.is_(None))
                .scalar()
            )

            stats = {
                "total_patients": total_patients,
                "total_records": total_records,
                "defaulters": defaulters,
                "not_administered": not_administered,
                "administered_rate": (
                    ((total_records - not_administered) / total_records * 100)
                    if total_records > 0
                    else 0
                ),
                "defaulter_rate": (
                    (defaulters / total_records * 100) if total_records > 0 else 0
                ),
            }

            return stats
    except Exception as e:
        logger.error(f"Error getting processing stats: {e}")
        return {}


def query_data():
    """Entry point function"""
    try:
        with app.app_context():
            processor = ImmunizationDataProcessor()
            return processor.process_data()
    except Exception as e:
        error_message = f"Error in query_data: {e}"
        logger.error(error_message)
        return error_message


def main():
    """Main entry point with enhanced error handling and reporting"""
    try:
        logger.info("Starting immunization data processing")

   # empty the table
        db.session.query(PrimaryImmunizationDataset).delete()
        db.session.commit()
        # # Clean up any invalid records first
        # cleanup_result = clean_database()
        # logger.info(cleanup_result)

        # Process the data
        processing_result = query_data()
        logger.info(processing_result)

        # Get and log statistics
        stats = get_processing_stats()
        stats_message = (
            f"\nProcessing Statistics:\n"
            f"Total Patients: {stats.get('total_patients', 0):,}\n"
            f"Total Records: {stats.get('total_records', 0):,}\n"
            f"Defaulters: {stats.get('defaulters', 0):,}\n"
            f"Not Administered: {stats.get('not_administered', 0):,}\n"
            f"Administration Rate: {stats.get('administered_rate', 0):.2f}%\n"
            f"Defaulter Rate: {stats.get('defaulter_rate', 0):.2f}%"
        )
        logger.info(stats_message)

        return processing_result + "\n" + stats_message

    except Exception as e:
        error_message = f"Critical error in main execution: {e}"
        logger.error(error_message)
        return error_message


if __name__ == "__main__":
    result = main()
    print(result)
