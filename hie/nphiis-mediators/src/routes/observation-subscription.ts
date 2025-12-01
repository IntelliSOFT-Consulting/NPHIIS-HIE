import express from 'express';
import { FhirApi, OperationOutcome, sendMediatorRequest } from '../lib/utils';
import { processAfpObservation } from '../lib/notification';

export const router = express.Router();

router.use(express.json() as any);


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
router.put('/notifications/Observation/:id', async (req, res) => {
  console.log("🟢 Observation subscription triggered for ID:", req.params.id);
  try {
    let { id } = req.params;
    console.log("🟢 Fetching observation data...");
    let data = await (await FhirApi({ url: `/Observation/${id}` })).data;
    console.log("🟢 About to call sendMediatorRequest...");
    let response = await sendMediatorRequest("/process-observations/afp-follow-up", data);
    console.log("🟢 sendMediatorRequest returned:", response);
    res.statusCode = 200;
    return res.json(OperationOutcome('AFP Follow Up processed successfully', 'information'));
  } catch (error) {
    console.error("🔴 Error in Observation subscription:", error);
    return res.status(400).json(OperationOutcome('Failed to process AFP Follow Up', 'error'));
  }
});

//process FHIR beneficiary
router.post('/afp-follow-up', async (req, res) => {
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
