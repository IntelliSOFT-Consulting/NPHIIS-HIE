from pyhive import hive
from dotenv import load_dotenv
import traceback
import os
import json
from datetime import datetime
import pg as db
import requests

load_dotenv()


def get_hive_connection():
    """Get Hive connection using environment variables."""
    try:
        host = os.getenv("HIVE_SERVER")
        port = int(os.getenv("HIVE_PORT"))
        database = "default"
        return hive.connect(host=host, port=port, database=database)
    except Exception as e:
        print(f"Error establishing Hive connection: {e}")
        return None


fhir_server = os.getenv("FHIR_SERVER")


def get_fhir_resources(resource_type):
    """Get FHIR resources from the server."""
    try:
        response = requests.get(f"{fhir_server}/{resource_type}?_count=1000000")
        response.raise_for_status()
        entries = response.json().get("entry", [])
        resources = [e["resource"] for e in entries]
        return resources
    except requests.exceptions.RequestException as e:
        print(f"Error fetching FHIR resources: {e}")
        return []


def safe_get(data, *keys):
    """Safely get a value from nested dictionaries."""
    for key in keys:
        if isinstance(data, dict):
            data = data.get(key)
        else:
            return None
    return data


def parse_json_if_string(data):
    """Parse JSON if the input is a string, otherwise return the input unchanged."""
    if isinstance(data, str):
        try:
            return json.loads(data)
        except json.JSONDecodeError as e:
            print(f"Failed to parse JSON: {data}, Error: {e}")
            return data
    return data


def fetch_data(cursor, table_name):
    """Fetch data from a table and return it as a list of dictionaries."""
    try:
        cursor.execute(f"SELECT * FROM {table_name}")
        columns = [column[0] for column in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]
    except Exception as e:
        print(f"Error fetching data from {table_name}: {e}")
        return []


def process_patient_data(patient_data):
    """Extract and process relevant patient information."""
    # print("patient_data", patient_data)
    try:
        payload = {}
        payload["patient_id"] = patient_data["id"]
        payload["family_name"] = patient_data["name"][0]["family"]
        payload["given_name"] = " ".join(patient_data["name"][0]["given"])
        payload["national_id"] = patient_data["identifier"][0]["value"]
        payload["gender"] = patient_data["gender"]
        payload["deceased"] = patient_data.get("deceasedBoolean", False)
        payload["active"] = patient_data.get("active", True)
        payload["birth_date"] = patient_data["birthDate"].split("T")[0]
        payload["patient_update_date"] = patient_data["meta"]["lastUpdated"]
        payload["phone"] = patient_data.get("telecom", [{}])[0].get("value", None)
        payload["county"] = patient_data.get("address", [{}])[0].get("city", None)
        payload["subcounty"] = patient_data.get("address", [{}])[0].get("district", None)
        payload["ward"] = patient_data.get("address", [{}])[0].get("state", None)

        patient_meta = patient_data["meta"]

        tag = patient_meta.get("tag", [{}])

        if tag and tag[0].get("display", ""):
            payload["facility"] = tag[0].get("display", "N/A")
            payload["facility_code"] = tag[0].get("code", "").replace("Location/", "")
        patient_contacts = patient_data["contact"]

        if not payload["phone"]:
            for contact in patient_contacts:
                if "telecom" in contact:
                    phone = contact["telecom"][0]["value"]
                    if not payload["phone"]:
                        payload["phone"] = (
                            f"{phone} ({contact['relationship'][0]['text']})"
                        )
                    payload["pat_relation"] = contact["relationship"][0]["text"]
                    payload["pat_relation_name"] = contact["name"]["text"]
                    payload["pat_relation_tel"] = phone
                    break

        patient_birth_date = datetime.strptime(
            patient_data["birthDate"].split("T")[0], "%Y-%m-%d"
        ).date()
        current_date = datetime.now().date()
        age = current_date - patient_birth_date
        age_in_years = round(age.days / 365.25, 2)
        payload["age_y"] = age_in_years
        payload["age_group"] = "Above 1 year" if age_in_years > 1 else "Below 1 year"
        payload["age_m"] = round(age.days / 30.4375, 2)

        return payload
    except Exception as e:
        print(f"Error processing patient data: {e}")
        print(traceback.format_exc())
        return {}


def process_vaccine_recommendation(vaccine, immunizations, patient_id):
    """Process each vaccine recommendation and check for corresponding immunizations."""
    try:
        payload = {"patient_id": patient_id}

        due_date = next(
            (
                date["value"]
                for date in vaccine["dateCriterion"]
                if date["code"]["coding"][0]["code"] == "Earliest-date-to-administer"
            ),
            None,
        ).split("T")[0]
        payload["due_date"] = due_date

        vaccine_code = vaccine["vaccineCode"][0]["coding"][0]["code"]
        payload["vaccine_code"] = vaccine_code
        payload["vaccine_name"] = vaccine["vaccineCode"][0]["text"]
        payload["target_disease"] = vaccine["targetDisease"]["text"]
        payload["vaccine_category"] = vaccine.get("description", None)
        payload["series"] = vaccine.get("series", None)
        payload["the_dose"] = vaccine.get("doseNumberPositiveInt", 0)

        immunization_record = next(
            (
                imm
                for imm in immunizations
                if imm["vaccineCode"]["coding"][0]["code"] == vaccine_code
            ),
            None,
        )

        print("immunization_record", immunization_record)

        if immunization_record:
            payload["imm_status"] = immunization_record["status"]
            occ_date = immunization_record.get("recorded", None)
            payload["occ_date"] = occ_date
            days_from_due = (
                datetime.strptime(occ_date, "%Y-%m-%dT%H:%M:%S.%fZ").date()
                - datetime.strptime(due_date, "%Y-%m-%d").date()
            ).days
            payload["days_from_due"] = days_from_due
            payload["faci_outr"] = immunization_record.get("note", [{}])[0].get("text", "N/A")
            payload["batch_number"] = immunization_record.get("lotNumber", "N/A")
            payload["imm_status_defaulter"] = "Yes" if days_from_due > 14 else "No"
        else:
            payload["imm_status"] = "Missed Immunization"
            days_from_due = (
                datetime.strptime(due_date, "%Y-%m-%d").date() - datetime.now().date()
            ).days
            payload["imm_status_defaulter"] = "Yes" if days_from_due > 14 else "No"

        return payload
    except Exception as e:
        print(f"Error processing vaccine recommendation: {e}")
        print(traceback.format_exc())
        return {}


def query_data():
    """Main function to query and process data."""
    conn = get_hive_connection()
    if not conn:
        return []

    try:
        with conn.cursor() as cursor:

            # immunization_recommendations = fetch_data(
            #     cursor, "immunizationrecommendation"
            # )
            # patients = fetch_data(cursor, "Patient")
            # immunizations = fetch_data(cursor, "Immunization")

            immunization_recommendations = get_fhir_resources(
                "ImmunizationRecommendation"
            )
            patients = get_fhir_resources("Patient")
            immunizations = get_fhir_resources("Immunization")

            # create a json file and save the immunization_recommendations
            with open("immunization_recommendations.json", "w") as f:
                json.dump(immunization_recommendations, f)

            # create a json file and save the patients
            with open("patients.json", "w") as f:
                json.dump(patients, f)

            # create a json file and save the immunizations
            with open("immunizations.json", "w") as f:
                json.dump(immunizations, f) 

        results = []
        for recommendation in immunization_recommendations:
            patient_id = recommendation["patient"]["reference"].split("/")[1]

            patient_data = next((p for p in patients if p["id"] == patient_id), None)

            print("patient_data", patient_data)

            if patient_data:
                payload = process_patient_data(patient_data)
                vaccine_recommendation = recommendation["recommendation"]

                for vaccine in vaccine_recommendation:
                    vaccine_payload = process_vaccine_recommendation(
                        vaccine, immunizations, patient_id
                    )
                    results.append({**payload, **vaccine_payload})

        # create a json file and save the results
        with open("results.json", "w") as f:
            json.dump(results, f)

        # db.insert_data(results)
        return "Data inserted successfully"
    except Exception as e:
        print(f"Error during data querying: {e}")
        print(traceback.format_exc())
        return []
    finally:
        conn.close()


