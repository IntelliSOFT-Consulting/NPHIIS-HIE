import express, { Request, Response } from 'express';
import { FhirApi, OperationOutcome, FhirIdentifier } from '../lib/utils';
import { processFollowUpObservations } from '../lib/fhir';
import { generateCaseId } from '../lib/caseIdTracker';
import { processAfpObservation } from '../lib/notification';

const router = express.Router();
router.use(express.json() as any);

const POSSIBLE_REASON_CODES: Record<string, string> = {
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

function getValidYear(dateString: string | undefined, fallbackDate: Date = new Date()): number {
  if (!dateString) {
    return fallbackDate.getFullYear();
  }

  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return fallbackDate.getFullYear();
  }

  return date.getFullYear();
}

async function assignIdsHandler(req: Request, res: Response) {
  try {
    let data = req.body;
    let caseId;

    let encounterCodeSystem = "http://hie.org/identifiers/EPID";
    let reasonCode = data?.reasonCode?.[0]?.coding?.[0]?.code;

    let patientId = data?.subject?.reference?.split("/")[1];
    let patient = await (await FhirApi({ url: `/Patient/${patientId}` })).data;

    let onsetDate = patient?.identifier?.find((id: any) =>
      id.system === "system-creation" &&
      id.type?.coding?.some((coding: any) =>
        coding.code === "system_creation"
      )
    )?.value;
    let normalizedOnsetDate = onsetDate;
    if (onsetDate && typeof onsetDate === "string") {
      normalizedOnsetDate = onsetDate.split(" ")[0];
    }

    if (!normalizedOnsetDate && patient?.birthDate) {
      normalizedOnsetDate = patient.birthDate;
      console.log("Using Patient birthDate as fallback for EPID year");
    }

    const yearForId = getValidYear(normalizedOnsetDate);

    if (!onsetDate) {
      console.warn(`Patient ${patientId} missing system-creation identifier. Using fallback for EPID year: ${yearForId}`);
    }

    let epidIdentifier = patient?.identifier?.find((id: any) =>
      id.type?.coding?.some((coding: any) =>
        coding.system === "http://hie.org/identifiers/EPID"
      )
    );

    if (epidIdentifier?.use === "official") {
      console.log("Patient already has an official id with the system http://hie.org/identifiers/EPID");
      processFollowUpObservations(data?.id);
      return res.status(400).json(OperationOutcome("Patient already has an official id with the system http://hie.org/identifiers/EPID"));
    }

    if (epidIdentifier) {
      patient.identifier = patient.identifier.filter((id: any) => !(
        Array.isArray(id?.type?.coding) &&
        id.type.coding.some(
          (coding: any) =>
            coding.system === "http://hie.org/identifiers/EPID"
        )
      ));
    }

    const rc = reasonCode ? String(reasonCode) : "";
    let caseCondition = POSSIBLE_REASON_CODES[rc] || (rc ? rc.toUpperCase().slice(0, 3) : "UNK");

    const subCountyCode = "a3-sub-county";
    const subCountyObservation = await (await FhirApi({ url: `/Observation?code=${subCountyCode}&encounter=${data?.id}` })).data?.entry?.[0]?.resource;
    const subCounty = await (await FhirApi({ url: `/Location?name=${subCountyObservation?.valueString}` })).data?.entry?.[0]?.resource;
    const county = await (await FhirApi({ url: `/Location/${subCounty?.partOf?.reference?.split("/")[1]}` })).data;
    const country = await (await FhirApi({ url: `/Location/${county?.partOf?.reference?.split("/")[1]}` })).data;

    const subCountyName = subCounty?.name?.toUpperCase()?.trim();
    const countyName = county?.name?.toUpperCase()?.trim();
    const countryName = country?.name?.toUpperCase()?.trim();

    caseId = await generateCaseId(countryName, countyName, subCountyName, caseCondition);

    let formattedId = `${countryName.substring(0, 3)}-${countyName.substring(0, 3)}-${subCountyName.substring(0, 3)}-${yearForId}-${caseCondition}-${toThreeDigits(caseId)}`;

    let newId = FhirIdentifier(encounterCodeSystem, "EPID", "Epidemiological ID", formattedId, true);

    await (await FhirApi({
      url: `/Patient/${patientId}`, method: "PUT",
      data: JSON.stringify({
        ...patient,
        identifier: [
          ...patient?.identifier,
          newId
        ]
      })
    })).data;
    console.log("updatedPatient:", newId);

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
}

router.put('/encounters/notifications/Encounter/:id', async (req, res) => {
  console.log("Encounter subscription triggered for ID:", req.params.id);
  try {
    let { id } = req.params;
    let data = await (await FhirApi({ url: `/Encounter/${id}` })).data;

    let patient = await (await FhirApi({ url: `/Patient/${data?.subject?.reference?.split("/")[1]}` })).data;

    if (patient?.identifier?.some((id: any) => id.system === "http://hie.org/identifiers/EPID" && id.use === "official")) {
      return res.status(200).json(OperationOutcome("Patient already has an official id with the system http://hie.org/identifiers/EPID"));
    }

    (req as any).body = data;
    return assignIdsHandler(req, res);
  } catch (error) {
    console.error("Error in Encounter subscription:", error);
    res.statusCode = 400;
    res.json(OperationOutcome(error));
    return;
  }
});

router.post('/encounters/assign-ids', assignIdsHandler);

router.put('/observations/notifications/Observation/:id', async (req, res) => {
  console.log("Observation subscription triggered for ID:", req.params.id);
  try {
    let { id } = req.params;
    let data = await (await FhirApi({ url: `/Observation/${id}` })).data;
    const response = await processAfpObservation(data);
    if (response?.status === "success") {
      return res.status(200).json(OperationOutcome('AFP Follow Up processed successfully', 'information'));
    }
    return res.status(400).json(OperationOutcome(response?.error ?? 'Failed to process AFP Follow Up', 'error'));
  } catch (error) {
    console.error("Error in Observation subscription:", error);
    return res.status(400).json(OperationOutcome('Failed to process AFP Follow Up', 'error'));
  }
});

router.post('/observations/afp-follow-up', async (req, res) => {
  try {
    let data = req.body;
    const response = await processAfpObservation(data);
    if(response?.status === "success"){
      return res.status(200).json(OperationOutcome('Notification created successfully', 'information'));
    }
    return res.status(400).json(OperationOutcome(response?.error ?? 'Failed to create notification', 'error'));

  } catch (error) {
    console.error(error);
    return res.status(400).json(OperationOutcome('Failed to create notification', 'error'));
  }
});

export default router;
