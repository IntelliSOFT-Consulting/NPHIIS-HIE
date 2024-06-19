import psycopg2
import os
from dotenv import load_dotenv
from datetime import datetime, timedelta

load_dotenv()


def get_db_connection():
    conn = psycopg2.connect(
        database=os.getenv("POSTGRES_DB"),
        user=os.getenv("POSTGRES_USER"),
        password=os.getenv("POSTGRES_PASSWORD"),
        host=os.getenv("POSTGRES_SERVER"),
        port=int(os.getenv("POSTGRES_PORT")),
    )
    return conn


conn = get_db_connection()


def create_date_query(start_date=None, end_date=None):
    search_query = ""
    if start_date:
        date_query = (
            datetime.strptime(start_date, "%Y-%m-%d") - timedelta(days=14)
        ).strftime("%Y-%m-%d")
        search_query += f"AND Due_Date >= '{date_query}' "
    if end_date:
        date_query = (
            datetime.strptime(end_date, "%Y-%m-%d") - timedelta(days=14)
        ).strftime("%Y-%m-%d")
        search_query += f"AND Due_Date <= '{date_query}' "
    return search_query.strip()


def row_to_dict(row, cursor):
    return {column[0]: row[idx] for idx, column in enumerate(cursor.description)}


def create_table():
    with conn.cursor() as cursor:
        create_query_table = """
        CREATE TABLE IF NOT EXISTS queries (
            id SERIAL PRIMARY KEY,
            sql TEXT,
            name VARCHAR
        );
        """
        create_table_query = """
        CREATE TABLE IF NOT EXISTS primary_immunization_dataset (
            id SERIAL PRIMARY KEY,
            patient_id VARCHAR,
            family_name VARCHAR,
            given_name VARCHAR,
            national_id VARCHAR,
            patient_update_date VARCHAR,
            vaccineCategory VARCHAR,
            phone VARCHAR,
            gender VARCHAR,
            birthDate VARCHAR,
            the_age VARCHAR,
            age_y FLOAT,
            age_m FLOAT,
            age_group VARCHAR,
            active BOOLEAN,
            deceased VARCHAR,
            maritalStatus VARCHAR,
            multipleBirth VARCHAR,
            pat_relation VARCHAR,
            pat_relation_name VARCHAR,
            pat_relation_tel VARCHAR,
            Due_Date VARCHAR,
            county VARCHAR,
            subcounty VARCHAR,
            ward VARCHAR,
            facility VARCHAR,
            facility_code VARCHAR,
            the_vaccine_seq INT,
            vaccineCode VARCHAR,
            vaccineName VARCHAR,
            the_dose INT,
            description VARCHAR,
            series VARCHAR,
            occ_date VARCHAR,
            Days_From_Due INT,
            faci_outr VARCHAR,
            imm_status VARCHAR,
            imm_status_defaulter VARCHAR
        );
        """
        cursor.execute(create_query_table)
        cursor.execute(create_table_query)
    conn.commit()


def execute_query(query):
    with conn.cursor() as cursor:
        cursor.execute(query)
        if query.strip().lower().startswith("select"):
            rows = cursor.fetchall()
            return [row_to_dict(row, cursor) for row in rows]
    conn.commit()


def insert_data(data):
    delete_query = "DELETE FROM primary_immunization_dataset;"
    insert_query = """
    INSERT INTO primary_immunization_dataset (
        patient_id, family_name, given_name, national_id,patient_update_date, gender, phone,
        birthDate, the_age, age_y, age_m, age_group, active, deceased, maritalStatus,
        multipleBirth, pat_relation, pat_relation_name, pat_relation_tel, Due_Date,
        county, subcounty, ward, facility, facility_code, the_vaccine_seq, vaccineCode,
        vaccineName, the_dose, description, series, occ_date, Days_From_Due, faci_outr, imm_status,
        imm_status_defaulter
    ) VALUES (
        %(patient_id)s, %(family_name)s, %(given_name)s, %(national_id)s, %(patient_update_date)s, %(vaccineCategory)s, %(gender)s,
        %(phone)s, %(birthDate)s, %(the_age)s, %(age_y)s, %(age_m)s, %(age_group)s,
        %(active)s, %(deceased)s, %(maritalStatus)s, %(multipleBirth)s, %(pat_relation)s,
        %(pat_relation_name)s, %(pat_relation_tel)s, %(Due_Date)s, %(county)s, %(subcounty)s,
        %(ward)s, %(facility)s, %(facility_code)s, %(the_vaccine_seq)s, %(vaccineCode)s,
        %(vaccineName)s, %(the_dose)s, %(description)s, %(series)s, %(occ_date)s, %(Days_From_Due)s,
        %(faci_outr)s, %(imm_status)s, %(imm_status_defaulter)s
    );
    """
    with conn.cursor() as cursor:
        cursor.execute(delete_query)
        for row in data:
            cursor.execute(insert_query, row)
    conn.commit()


def run_query(query_name):
    query = f"SELECT sql FROM queries WHERE name = %s;"
    with conn.cursor() as cursor:
        cursor.execute(query, (query_name,))
        result = cursor.fetchone()
        if not result:
            return "Query not found"
        cursor.execute(result[0])
        rows = cursor.fetchall()
        return [row_to_dict(row, cursor) for row in rows]


def insert_query(name, sql):
    insert_query = """
    INSERT INTO queries (name, sql) VALUES (%(name)s, %(sql)s);
    """
    with conn.cursor() as cursor:
        cursor.execute(insert_query, {"name": name, "sql": sql})
    conn.commit()


def query_defaulters(name="", vaccine_name="", start_date="", end_date=""):
    search_query = ""
    if name:
        search_query += (
            f"AND (family_name ILIKE '%{name}%' OR given_name ILIKE '%{name}%') "
        )
    if vaccine_name:
        search_query += f"AND vaccinename ILIKE '%{vaccine_name}%' "
    search_query += create_date_query(start_date, end_date)

    query = f"""
    SELECT * FROM primary_immunization_dataset
    WHERE imm_status_defaulter = 'Yes' {search_query};
    """
    with conn.cursor() as cursor:
        cursor.execute(query)
        rows = cursor.fetchall()
        return [row_to_dict(row, cursor) for row in rows]


create_table()

print(
    "Table 'primary_immunization_dataset' created successfully (if it didn't already exist)."
)
