from pyhive import hive
from dotenv import load_dotenv
import os
import requests
import json
import logging
from typing import List, Dict

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

load_dotenv()

# Hive connection parameters
HIVE_HOST = os.getenv("HIVE_SERVER")
HIVE_PORT = int(os.getenv("HIVE_PORT"))
HIVE_DATABASE = "default"

# Node.js server URL to send data to
NODE_SERVER_URL = os.getenv("NODE_SERVER_URL")


def get_hive_connection():
    """Get Hive connection"""
    try:
        return hive.connect(host=HIVE_HOST, port=HIVE_PORT, database=HIVE_DATABASE)
    except Exception as e:
        logger.error(f"Error establishing Hive connection: {e}")
        raise


def execute_hive_query(query: str) -> List[Dict]:
    """Execute Hive query with proper connection management"""
    conn = None
    try:
        conn = get_hive_connection()
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


# Connect to Hive and fetch data
def fetch_data_from_hive():
    try:
        locations = execute_hive_query("SELECT * FROM location")
        patients = execute_hive_query("SELECT * FROM patient")
        recommendations = execute_hive_query("SELECT * FROM immunizationrecommendation")
        immunizations = execute_hive_query("SELECT * FROM immunization")

        locations_dict = {l["id"]: l for l in locations}

        return {
            "locations": locations_dict,
            "patients": patients,
            "recommendations": recommendations,
            "immunizations": immunizations,
        }
    except Exception as e:
        logger.error(f"Error fetching data from Hive: {e}")
        raise


# Send data to Node.js server
def send_data_to_node(data):
    headers = {"Content-Type": "application/json"}
    response = requests.post(
        f"{NODE_SERVER_URL}/api/data/hive", data=json.dumps(data), headers=headers
    )
    if response.status_code == 200:
        print("Data sent successfully to Node.js")
    else:
        print("Failed to send data:", response.text)


# Main function
if __name__ == "__main__":
    data = fetch_data_from_hive()
    send_data_to_node(data)
