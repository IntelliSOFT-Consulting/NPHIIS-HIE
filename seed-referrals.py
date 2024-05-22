import json, requests, random
from datetime import date, timedelta


today = date.today().strftime("%Y-%m-%d")
last_date = (date.today() + timedelta(days=10)).strftime("%Y-%m-%d")

HAPI_FHIR_SERVER = "https://chanjoke.intellisoftkenya.com/hapi/fhir"

vaccine_codes =  {
        "10517": "BCG Vaccines",
        "29659": "HPV Vaccines",
        "24014": "Measles - Rubella Vaccines",
        "3573": "Pneumococcal Vaccines",
        "2763": "Rotavirus Vaccines",
        "2748": "Rubella Vaccines",
        "1002": "Yellow Fever Vaccines",
        "3549": "Inactivated Polio Vaccines",
        "54379": "Oral/Bivalent Polio Vaccines",
        "15846": "Malaria Vaccine",
        "1107": "Vitamin A Vaccine",
        "50732": "Tdap vaccine",
        "18035": "Tdap vaccine",
        "13809": "Rabies",
        "6306": "Influenza"
}

def generate_service_request(patient_id, facility, chu, vaccine):
    return {
    "resourceType": "ServiceRequest",
    "status": "active",
    "intent": "order",
    "category": [
        {
            "coding": [
                {
                    "system": "https://nhdd-api.health.go.ke/orgs/MOH-KENYA/sources/nhdd/concepts/",
                    "code": "IMMZ-REFERRAL",
                    "display": "Referral"
                }
            ],
            "text": "Referral"
        }
    ],
    "priority": "urgent",
    "subject": {
        "reference": "Patient/{}".format(patient_id)
    },
    "occurrencePeriod": {
        "start": today,
        "end": last_date
    },
    "authoredOn": today,
    "requester": {
        "reference": "Organization/{}".format(chu)
    },
    "performer": [{"reference": "Organization/{}".format(facility), "display": get_facility_name(facility)}],
    "reasonCode": [
        {
            "coding": [
                {
                    "system": "https://nhdd-api.health.go.ke/orgs/MOH-KENYA/sources/nhdd/concepts/",
                    "code": vaccine,
                    "display": vaccine_codes[vaccine]
                }
            ],
            "text": vaccine_codes[vaccine]
        }
    ],
    "note": [{"text": "Patient should be immunized immediately"}]}
    
    
    
facilities = ["23541", "11237", "24979", "22261", "17892"]
chus = ["713825", "713822", "713823", "713821", "713806"]
vaccine_codes_list = list(vaccine_codes.keys())
# print(vaccine_codes_list)


def get_patients():
    response = requests.get("{}/Patient?_count=50".format(HAPI_FHIR_SERVER)).json()
    # print(response)
    patients = [patient for patient in response["entry"]]
    patient_ids = [patient["resource"]["id"] for patient in patients]
    return patient_ids


patient_ids = get_patients()


def get_facility_name(id):
    response =  requests.get("{}/Location/{}".format(HAPI_FHIR_SERVER, id)).json()
    return response["name"]



for i in range(0, 15):
    data = generate_service_request(
        random.choice(patient_ids), 
        random.choice(facilities), 
        random.choice(chus), 
        random.choice(vaccine_codes_list)
    )
    response = requests.post(HAPI_FHIR_SERVER + "/ServiceRequest", json=data).json()
    print(response["id"])
    
    
