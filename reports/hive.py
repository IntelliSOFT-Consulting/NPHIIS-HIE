from pyhive import hive
from dotenv import load_dotenv
import os
from query import sql
import pg as db

load_dotenv()

def get_hive_connection():
    host = os.getenv('HIVE_SERVER')
    port = int(os.getenv('HIVE_PORT'))
    database = 'default'
    return hive.connect(host=host, port=port, database=database)

def get_query():
    return ''.join([str(item) for item in sql])

def query_data():
    print("Querying data from Hive")
    conn = get_hive_connection()
    query = get_query()
    with conn.cursor() as cursor:
        cursor.execute(query)
        rows = cursor.fetchall()
        result = [
            {column[0]: row[idx] for idx, column in enumerate(cursor.description)}
            for row in rows
        ]
        db.insert_data(result)
    conn.close()
