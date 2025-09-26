import express from 'express';
import { FhirApi } from '../lib/utils';
import { v4 as uuid } from 'uuid';
import fetch from 'node-fetch';
import { FhirIdentifier } from '../lib/fhir';
import { generateCaseId } from '../lib/caseIdTracker';

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
      headers: {
        "Content-Type": "application/json",
        "Authorization": 'Basic ' + Buffer.from(OPENHIM_CLIENT_ID + ':' + OPENHIM_CLIENT_PASSWORD).toString('base64')
      }
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

    let reasonCode = "mpox-register";
    let encounterCodeSystem = "http://hie.org/identifiers/EPID";


    let patientId = data?.subject?.reference?.split("/")[1];
    let patient = await (await FhirApi({ url: `/Patient/${patientId}` })).data;

    // if patient does not have an id with the code mpox-register, return
    if (!patient?.identifier?.some((id: any) => id?.type?.coding[0]?.code === reasonCode)) {
      res.statusCode = 200;
      res.json({
        "resourceType": "OperationOutcome",
        "id": uuid(),
        "issue": [{
          "severity": "information",
          "code": "informational",
          "details": {
            "text": `Patient does not have an id with the code mpox-register`
          }
        }]
      });
      console.log("Patient does not have an id with the code mpox-register");
      return;
    }

    // if (Array.isArray(data?.identifier) &&
    //   data.identifier.some((id: any) => id.system === encounterCodeSystem)
    // ) {
    //   res.statusCode = 200;
    //   res.json({
    //     "resourceType": "OperationOutcome",
    //     "id": uuid(),
    //     "issue": [{
    //       "severity": "information",
    //       "code": "informational",
    //       "details": {
    //         "text": `ID already assigned - ${JSON.stringify(data)}`
    //       }
    //     }]
    //   });
    //   return;
    // }


    let patientIdentifier = patient?.identifier?.find((id: any) => id.system === encounterCodeSystem);
    if (patientIdentifier) {
      // remove the patient identifier with the system http://hie.org/identifiers/EPID
      patient.identifier = patient.identifier.filter((id: any) => id.system !== encounterCodeSystem);
    }



    let observations = await (await FhirApi({ url: `/Observation?encounter=Encounter/${data?.id}&_count=1000` })).data;
    observations = observations.entry;
    let county;
    let subCounty;
    let caseCondition = "MPOVAC";
    let caseId;
    let epidNo;
    let epidNoObservation;
    let onsetDate;
    let countryOfOrigin;


    const subCountyCode = "a3-sub-county";
    const countyCode = "a4-county";
    const caseConditionCode = "a5-disease-reported";
    const epidNoCode = "EPID";
    const onsetDateCode = "date_given";
    const countryOfOriginCode = "country_of_origin";

    for (let obs of observations) {
      if (obs.resource.code.coding[0].code === countyCode) {
        county = obs.resource.code.text;
      }
      if (obs.resource.code.coding[0].code === subCountyCode) {
        subCounty = obs.resource.code.text;
      }
      // if (obs.resource.code.coding[0].code === caseConditionCode) {
      //   caseCondition = obs.resource.code.text;
      // }
      if (obs.resource.code.coding[0].code === epidNoCode) {
        epidNoObservation = obs.resource;
        epidNo = obs.resource.valueString;
      }
      if (obs.resource.code.coding[0].code === countryOfOriginCode) {
        countryOfOrigin = obs.resource.valueString;
      }
      if (obs.resource.code.coding[0].code === onsetDateCode) {
        onsetDate = obs.resource.valueString;
      }
    }

    caseId = await generateCaseId(county ?? countryOfOrigin, subCounty);
    if(!countryOfOrigin){
      countryOfOrigin = "KEN";
    }

    console.log(countryOfOrigin, county, subCounty, onsetDate, caseId);

    let formattedId = `${countryOfOrigin.substring(0, 3).toUpperCase()}-${county.substring(0, 3).toUpperCase()}-${subCounty.substring(0, 3).toUpperCase()}-${new Date(onsetDate).getFullYear()}-${caseCondition}-${toThreeDigits(caseId)}`;

    // check if formattedId is already in use
    let encounters = await (await FhirApi({ url: `/Encounter?identifier=${formattedId}&_summary=count` })).data;
    if (encounters.total > 0) {
      formattedId = `${countryOfOrigin.substring(0, 3).toUpperCase()}-${county.substring(0, 3).toUpperCase()}-${subCounty.substring(0, 3).toUpperCase()}-${new Date(onsetDate).getFullYear()}-${caseCondition}-${toThreeDigits(caseId + 1)}`;
    }

    // let formattedId = epidNo + String(toThreeDigits(caseId));


    let newId = FhirIdentifier(encounterCodeSystem, "EPID", "Epidemiological ID", formattedId);

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
    // Update the code text and valueString of the epidNoObservation with the new formattedId
    if (epidNoObservation && epidNoObservation.code) {
      epidNoObservation.code = {
        ...epidNoObservation.code,
        text: formattedId
      };
      epidNoObservation.valueString = formattedId;
    }

    let updatedObservation = await (await FhirApi({ url: `/Observation/${epidNoObservation?.id}`, method: "PUT", data: JSON.stringify({ ...epidNoObservation, code: { ...epidNoObservation.code, text: formattedId } }) })).data;
    console.log(updatedObservation)

    // update the encounter with the new caseId
    // remove the encounter identifier with the system http://hie.org/identifiers/EPID
    data.identifier = data.identifier.filter((id: any) => id.system !== encounterCodeSystem);
    data.identifier.push(newId)
    let updatedEncounter = await (await FhirApi({
      url: `/Encounter/${data?.id}`, method: "PUT",
      data: JSON.stringify({ ...data, identifier: [{ system: encounterCodeSystem, value: formattedId }] })
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
          "text": `Failed to assign ids for encounter - ${JSON.stringify(error)}`
        }
      }]
    });
    return;
  }
});

export default router;
