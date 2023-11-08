import express from 'express';
import { FhirApi, getPatientByCrossBorderId, generateCrossBorderId, getPatientSummary } from '../lib/utils';
import { ParsedQs } from 'qs'

export const router = express.Router();

router.use(express.json());

// get patient information by crossborder ID
router.get('/', async (req, res) => {
    try {
        let _queryParams: ParsedQs = req.query;
        let queryParams: Record<string, any> = { ..._queryParams }
        let { id, crossBorderId, identifier } = req.query;
        let params = []
        for (const k of Object.keys(queryParams)) {
            params.push(`${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`);
        }

        let patient = (await FhirApi({ url: `/Patient?${params.join("&")}` })).data;
        if (patient) {
            res.statusCode = 200;
            if (identifier) {
                patient = patient.total > 0 ? patient.entry[0].resource : patient;
                res.json(patient);
                return;
            }
            res.json(patient);
            return;
        }
        res.statusCode = 404;
        res.json({
            "resourceType": "OperationOutcome",
            "id": "exception",
            "issue": [{
                "severity": "error",
                "code": "exception",
                "details": {
                    "text": "Failed to register patient. CrossBorder patient not found"
                }
            }]
        });
        return;
    } catch (error) {
        res.statusCode = 400;
        console.log(error);
        res.json({
            "resourceType": "OperationOutcome",
            "id": "exception",
            "issue": [{
                "severity": "error",
                "code": "exception",
                "details": {
                    "text": `Failed to register patient. ${JSON.stringify(error)}`
                }
            }]
        });
        return;
    }
})


// create or register a new patient
router.post('/', async (req, res) => {
    try {
        let data = req.body;
        console.log(req.headers)
        let crossBorderId = await generateCrossBorderId(data);
        // console.log(crossBorderId)
        let sampleCrossborderId = {
            "id": "09e02f17-5cc7-4bd0-b957-34e4c8b5892b",
            "use": "usual",
            "type": {
                "coding": [
                    {
                        "code": "e5e9a994-12e2-42c3-9c02-5abdc0fe40e8"
                    }
                ],
                "text": "Cross-Border ID"
            },
            "system": "urn:oid:2.16.840.1.113883.3.26.1.3",
            "value": crossBorderId
        }
        data.identifier.push(sampleCrossborderId)
        // console.log(parsedPatient);
        let patient = (await FhirApi({
            url: `/Patient`,
            data: JSON.stringify(data),
            method: 'POST'
        })).data;
        if (patient.id) {
            res.statusCode = 200;
            res.json(patient);
            return;
        }
        res.statusCode = 400;
        res.json(patient);
        return;
    } catch (error) {
        res.statusCode = 400;
        console.log(error);
        res.json({
            "resourceType": "OperationOutcome",
            "id": "exception",
            "issue": [{
                "severity": "error",
                "code": "exception",
                "details": {
                    "text": "Failed to find patient. Check the resource and try again"
                }
            }]
        });
        return;
    }
});

// patient search
router.get('/summary', async (req, res) => {
    try {
        let params = req.query;
        let summary = await getPatientSummary(String(params.crossBorderId));
        res.json(summary);
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
                    "text": `Failed to generate IPS Summary - ${JSON.stringify(error)}`
                }
            }]
        });
        return;
    }
});



//update patient details
router.put('/', async (req, res) => {
    try {
        let data = req.body;
        let crossBorderId = req.query.identifier || null;
        if (!crossBorderId) {
            let error = "crossBorderId is a required parameter"
            res.statusCode = 400;
            res.json({
                "resourceType": "OperationOutcome",
                "id": "exception",
                "issue": [{
                    "severity": "error",
                    "code": "exception",
                    "details": {
                        "text": `Failed to register patient. ${JSON.stringify(error)}`
                    }
                }]
            });
            return;
        }

        let patient = await getPatientByCrossBorderId(String(crossBorderId) || '')
        if (!patient) {
            let error = "Invalid crossBorderId provided"
            res.statusCode = 400;
            res.json({
                "resourceType": "OperationOutcome",
                "id": "exception",
                "issue": [{
                    "severity": "error",
                    "code": "exception",
                    "details": {
                        "text": `Patient not found - ${JSON.stringify(error)}`
                    }
                }]
            });;
            return;
        }
        let fhirId = patient.id;
        let updatedPatient = (await FhirApi({
            url: `/Patient/${fhirId}`,
            method: "PUT",
            data: JSON.stringify({ ...data, id: fhirId })
        }))
        console.log(updatedPatient)
        res.statusCode = 200;
        res.json(updatedPatient.data);
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
                    "text": `Failed to update patient- ${JSON.stringify(error)}`
                }
            }]
        });
        return;
    }
});

export default router;