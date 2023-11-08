import express from 'express';
import { generatePatientReference, _supportedResources } from '../lib/resources';
import { FhirApi, getPatientByCrossBorderId, generateCrossBorderId } from '../lib/utils';
import { validateResource } from '../lib/validate';


export const router = express.Router();

router.use(express.json());



// modify details
router.post('/', async (req, res) => {
    try {
        let resource = req.body;
        let data = await (await FhirApi({ url: ``, method: 'POST', data: JSON.stringify(resource) })).data
        if (["Unprocessable Entity", "Bad Request"].indexOf(data.statusText) > 0) {
            // res.statusCode = 400;
            res.json(data);
            return;
        }
        let patientId = data.entry[0].response.location;
        console.log(patientId)
        let patient = (await FhirApi({ url: `/${patientId}` })).data;
        let crossBorderId = await generateCrossBorderId(patient);
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
        patient.identifier.push(sampleCrossborderId)
        let _data = await (await FhirApi({ url: `/Patient/${patient.id}`, method: 'PUT', data: JSON.stringify(patient) })).data;
        res.json(_data);
        // res.json(patient);
        return;
    } catch (error) {
        console.log(error);
        res.statusCode = 400;
        res.json({
            "resourceType": "OperationOutcome",
            "id": "exception",
            "issue": [{
                "severity": "error", "code": "exception", "details": { "text": error }
            }]
        });
        return;
    }
})



export default router;