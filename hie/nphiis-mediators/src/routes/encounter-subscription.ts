import express from 'express';
import { FhirApi, sendMediatorRequest } from '../lib/utils';
import { v4 as uuid } from 'uuid';
import fetch from 'node-fetch';
import { FhirIdentifier, processFollowUpObservations } from '../lib/fhir';
import { generateCaseId } from '../lib/caseIdTracker';
import { OperationOutcome } from '../lib/fhir';

export const router = express.Router();

router.use(express.json() as any);

const POSSIBLE_REASON_CODES = {
  "Measles Case Information": "MEA",
  "MOH 505 Reporting Form": "MOH505",
  "AFP Case Information": "AFP"
}



function padStart(str: string, targetLength: number, padChar: string = '0'): string {
  while (str.length < targetLength) {
    str = padChar + str;
  }
  return str;
}

function toThreeDigits(num: number): string {
  return padStart(num.toString(), 3, '0');
}

//process FHIR beneficiary
router.put('/notifications/Encounter/:id', async (req, res) => {
  console.log("🟢 Encounter subscription triggered for ID:", req.params.id);
  try {
    let { id } = req.params;
    console.log("🟢 Fetching encounter data...");
    let data = await (await FhirApi({ url: `/Encounter/${id}` })).data;

    if(data.identifier?.some((id: any) => id.system === "http://hie.org/identifiers/EPID")) {
      return res.status(200).json(OperationOutcome("Encounter already has an official id with the system http://hie.org/identifiers/EPID"));
    }

    let response = await sendMediatorRequest("/process-encounters/assign-ids", data);
    console.log("🟢 sendMediatorRequest returned:", response);
    res.statusCode = response.code || 200;
    res.json(response.data || response);
    return;
  } catch (error) {
    console.error("🔴 Error in Encounter subscription:", error);
    res.statusCode = 400;
    res.json(OperationOutcome(error));
    return;
  }
});

//process FHIR beneficiary
router.post('/assign-ids', async (req, res) => {
  try {
    let data = req.body;
    let caseId;


    let encounterCodeSystem = "http://hie.org/identifiers/EPID";

    
    let reasonCode = data?.reasonCode?.[0]?.coding?.[0]?.code;

    let patientId = data?.subject?.reference?.split("/")[1];
    let patient = await (await FhirApi({ url: `/Patient/${patientId}` })).data;


    let onsetDate = data?.identifier?.find((id: any) =>
      id.system === "system-creation" &&
      id.type?.coding?.some((coding: any) =>
        coding.code === "system_creation"
      )
    )?.value;
    // Convert onsetDate to a normal date format (YYYY-MM-DD)
    // onsetDate is expected to be in the format "YYYY-MM-DD HH:mm:ss"
    let normalizedOnsetDate = onsetDate;
    if (onsetDate && typeof onsetDate === "string") {
      // Extract only the date part before any space
      normalizedOnsetDate = onsetDate.split(" ")[0];
    }

    
    let epidIdentifier = patient?.identifier?.find((id: any) =>
      id.type?.coding?.some((coding: any) =>
        coding.system === "http://hie.org/identifiers/EPID"
      )
    );

    if(epidIdentifier?.use === "official") {
      console.log("Patient already has an official id with the system http://hie.org/identifiers/EPID");
      return res.status(400).json(OperationOutcome("Patient already has an official id with the system http://hie.org/identifiers/EPID"));
    }

    if (epidIdentifier) {
      // remove the patient identifier with the system http://hie.org/identifiers/EPID
      patient.identifier = patient.identifier.filter((id: any) => !(
        Array.isArray(id?.type?.coding) &&
        id.type.coding.some(
          (coding: any) =>
            coding.system === "http://hie.org/identifiers/EPID"
        )
      ));
    }

    let caseCondition = POSSIBLE_REASON_CODES?.[reasonCode as keyof typeof POSSIBLE_REASON_CODES] || reasonCode.toUpperCase().slice(0, 3);
    

      const countyCode = "a4-county";
      const epidNoCode = "EPID";
      const onsetDateCode = "date_given";
    // fetch by code.....observations

      const subCountyCode = "a3-sub-county";
      const countryOfOriginCode = "country_of_origin";
      // console.log("Location:", location);
      const subCountyObservation = await (await FhirApi({ url: `/Observation?code=${subCountyCode}&encounter=${data?.id}` })).data?.entry?.[0]?.resource;
      const subCounty = await (await FhirApi({ url: `/Location?name=${subCountyObservation?.valueString}` })).data?.entry?.[0]?.resource;
      const county = await (await FhirApi({ url: `/Location/${subCounty?.partOf?.reference?.split("/")[1]}` })).data;
      const country = await (await FhirApi({ url: `/Location/${county?.partOf?.reference?.split("/")[1]}` })).data;

      const subCountyName = subCounty?.name?.toUpperCase()?.trim();
      const countyName = county?.name?.toUpperCase()?.trim();
      const countryName = country?.name?.toUpperCase()?.trim(); 

      caseId = await generateCaseId(countryName, countyName, subCountyName, caseCondition);

    let formattedId = `${countryName.substring(0, 3)}-${countyName.substring(0, 3)}-${subCountyName.substring(0, 3)}-${new Date(normalizedOnsetDate).getFullYear()}-${caseCondition}-${toThreeDigits(caseId)}`;

    let newId = FhirIdentifier(encounterCodeSystem, "EPID", "Epidemiological ID", formattedId, true);

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
    console.log("updatedPatient");
    console.log(newId);


    // update the encounter with the new caseId
    // remove the encounter identifier with the system http://hie.org/identifiers/EPID
    data.identifier = data.identifier.filter((id: any) => id.system !== encounterCodeSystem);
    data.identifier.push(newId)
    let updatedEncounter = await (await FhirApi({
      url: `/Encounter/${data?.id}`, method: "PUT",
      data: JSON.stringify({ ...data, identifier: [{ system: encounterCodeSystem, value: formattedId }] })
    })).data;

    processFollowUpObservations(data?.id);
    return res.status(200).json(updatedEncounter);
  } catch (error) {
    console.error(error);
    return res.status(400).json(OperationOutcome(error));
  }
});

export default router;
