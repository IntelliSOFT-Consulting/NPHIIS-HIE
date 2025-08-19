import express from 'express';
import { FhirApi } from '../lib/utils';
import { v4 as uuid } from 'uuid';
import fetch from 'node-fetch';
import { FhirIdentifier } from '../lib/fhir';

export const router = express.Router();

router.use(express.json());


function padStart(str: string, targetLength: number, padChar: string = '0'): string {
  while (str.length < targetLength) {
    str = padChar + str;
  }
  return str;
}

function toThreeDigits(num: number): string {
  return padStart(num.toString(), 3);
}

//process FHIR beneficiary
router.put('/notifications/Encounter/:id', async (req, res) => {
  try {
    let { id } = req.params;
    let data = await (await FhirApi({ url: `/Encounter/${id}` })).data;


    let ASSIGN_ID_ENDPOINT = process.env['ASSIGN_ID_ENDPOINT'] ?? "";
    let OPENHIM_CLIENT_ID = process.env['OPENHIM_CLIENT_ID'] ?? "";
    let OPENHIM_CLIENT_PASSWORD = process.env['OPENHIM_CLIENT_PASSWORD'] ?? "";
    let response = await (await fetch(ASSIGN_ID_ENDPOINT, {
      body: JSON.stringify(data),
      method: "POST",
      headers:{"Content-Type":"application/json",
      "Authorization": 'Basic ' + Buffer.from(OPENHIM_CLIENT_ID + ':' + OPENHIM_CLIENT_PASSWORD).toString('base64')}
    })).json();
    // let response = await (await fetch("http://localhost:3000/process-case-encounter/assign-ids", {
    //   body: JSON.stringify(data),
    //   method: "POST", headers: { "Content-Type": "application/json" }
    // })).json()
    if (response.code >= 400) {
      res.statusCode = response.code;
      res.json({
        "resourceType": "OperationOutcome",
        "id": "exception",
        "issue": [{
          "severity": "error",
          "code": "exception",
          "details": {
            "text": `Failed to post - ${JSON.stringify(response)}`
          }
        }]
      });
      return;
    }
    console.log(response);
    res.statusCode = 200;
    res.json(response);
    return;
  } catch (error) {
    console.error(error);
    res.statusCode = 400;
    res.json({
      "resourceType": "OperationOutcome",
      "id": "exception",
      "issue": [{
        "severity": "error",
        "code": "exception",
        "details": {
          "text": `Failed to post - ${JSON.stringify(error)}`
        }
      }]
    });
    return;
  }
});

//process FHIR beneficiary
router.post('/assign-ids', async (req, res) => {
  try {
    let data = req.body;

    let encounterCode = "case-information";
    let encounterCodeSystem = "http://hie.org/identifiers/EPID";
    if (Array.isArray(data?.identifier) &&
    data.identifier.some((id:any) => id.system === encounterCodeSystem)
    ) {
      res.statusCode = 200;
      res.json({
        "resourceType": "OperationOutcome",
        "id": uuid(),
        "issue": [{
          "severity": "information",
          "code": "informational",
          "details": {
            "text": `ID already assigned - ${JSON.stringify(data)}`
          }
        }]
      });
      return;
    }

    let observations = await (await FhirApi({ url: `/Observation?encounter=Encounter/${data?.id}&_count=200` })).data;
    observations = observations.entry;
    let county;
    let subCounty;
    let caseCondition;
    let caseId;
    let epidNo;
    let epidNoObservation;
    let onsetDate;

    const subCountyCode = "990815709263";
    const countyCode = "221146691983";
    const caseConditionCode = "a5-disease-reported";
    const epidNoCode = "EPID";
    const onsetDateCode = "451005827955";

    for (let obs of observations) {
      if (obs.resource.code.coding[0].code === countyCode) {
        county = obs.resource.code.text;
      }
      if (obs.resource.code.coding[0].code === subCountyCode) {
        subCounty = obs.resource.code.text;
      }
      if (obs.resource.code.coding[0].code === caseConditionCode) {
        caseCondition = obs.resource.code.text;
      }
      if (obs.resource.code.coding[0].code === epidNoCode) {
        epidNoObservation = obs.resource;
        epidNo = obs.resource.valueString;
      }
      if (obs.resource.code.coding[0].code === onsetDateCode) {
        onsetDate = obs.resource.valueString;
      }
    }
    let observationsForSubCounty = await (await FhirApi({ url: `/Observation?code=${subCountyCode}&code:text=${subCounty}&_sort=_lastUpdated&_count=200` })).data;
    let subCountyObservationCount = observationsForSubCounty?.total || 0;
    console.log(subCountyObservationCount);
    if(subCountyObservationCount === 0){
      subCountyObservationCount = 1;
    }
    caseId = subCountyObservationCount;

    // let formattedId = `KEN-${county.substring(0, 3).toUpperCase()}-${subCounty.substring(0, 3).toUpperCase()}-${new Date(onsetDate).getFullYear()}-${toThreeDigits(caseId)}-${caseCondition.toUpperCase().substring(0, 3)}`;
    let formattedId = epidNo + String(toThreeDigits(caseId));
    let patientId = data?.subject?.reference?.split("/")[1];
    let patient = await (await FhirApi({ url: `/Patient/${patientId}` })).data;

    let newId = FhirIdentifier("http://hie.org/identifiers/EPID", "EPID", "Epidemiological ID", formattedId);

    let updatedPatient = await (await FhirApi({
      url: `/Patient/${patientId}`, method: "PUT",
      data: JSON.stringify({
        ...patient,
        identifier: [
          ...patient?.identifier,
          newId
        ]
      })
    })).data;
    console.log(updatedPatient);

    // updated epid No in obs
    console.log(JSON.stringify(epidNoObservation));
    let updatedCode = epidNoObservation.code;
    console.log(JSON.stringify(updatedCode));
    updatedCode.text = formattedId;
    epidNoObservation.valueString = formattedId;

    let updatedObservation = await (await FhirApi({ url: `/Observation/${epidNoObservation?.id}`, method: "PUT", data: JSON.stringify({ ...epidNoObservation, updatedCode }) })).data;
    console.log(updatedObservation)

    // update the encounter with the new caseId
    let updatedEncounter = await (await FhirApi({
      url: `/Encounter/${data?.id}`, method: "PUT",
      data: JSON.stringify({ ...data, identifier: [{ system: "http://hie.org/identifiers/EPID", value: formattedId }] })
    })).data;

    res.statusCode = 200;
    res.json(updatedEncounter);
    return;
  } catch (error) {
    console.error(error);
    res.statusCode = 400;
    res.json({
      "resourceType": "OperationOutcome",
      "id": "exception",
      "issue": [{
        "severity": "error",
        "code": "exception",
        "details": {
          "text": `Failed to post beneficiary- ${JSON.stringify(error)}`
        }
      }]
    });
    return;
  }
});

export default router;
