import express from 'express';
import { generatePatientReference, _supportedResources } from '../lib/resources';
import { FhirApi, getPatientByCrossBorderId } from '../lib/utils';
import { validateResource } from '../lib/validate';


export const router = express.Router();

router.use(express.json());


const supportedResources = ['Observation', 'Medication', 'Immunization', 'AllergyIntolerance', 'MedicationRequest', 'Encounter', 'Condition'];

// get patient information
router.get('/:resourceType', async (req, res) => {
    try {
        let { crossBorderId } = req.query;
        let {resourceType} = req.params;
        if (!resourceType) {
            res.statusCode = 400;
            let error = `resource type is required`;
            res.json({
                "resourceType": "OperationOutcome",
                "id": "exception",
                "issue": [{
                    "severity": "error", "code": "exception", "details": { "text": error }
                }]
            });
            return;
        }
        let ipsComponent = resourceType;
        if (!crossBorderId) {
            res.statusCode = 400;
            let error = `Patient crossBorderId is required`;
            res.json({
                "resourceType": "OperationOutcome",
                "id": "exception",
                "issue": [{
                    "severity": "error", "code": "exception", "details": { "text": error }
                }]
            });
            return;
        }
        ipsComponent = String(ipsComponent).charAt(0).toUpperCase() + String(ipsComponent).slice(1);
        let patient = await getPatientByCrossBorderId(String(crossBorderId));
        console.log(patient);
        if (!patient) {
            res.statusCode = 404;
            res.json({
                "resourceType": "OperationOutcome",
                "id": "exception",
                "issue": [{
                    "severity": "error", "code": "exception", "details": { "text": `Cross Border Patient with the id ${crossBorderId} not found` }
                }]
            });
            return;
        }

        // MDM Expansion - search across all linked resources.
        let data = await (await FhirApi({ url: `/${ipsComponent}?patient=Patient/${patient.id}` })).data;
        console.log(data);
        res.json(data);
        return
    } catch (error) {
        res.statusCode = 400;
        res.json({
            "resourceType": "OperationOutcome",
            "id": "exception",
            "issue": [{
                "severity": "error", "code": "exception",
                "details": { "text": error }
            }]
        });
        return;
    }
})


// get patient information
router.post('/:resourceType', async (req, res) => {
    try {
        let resource = req.body;
        let { resourceType } = req.params;
        if (supportedResources.indexOf(resourceType) < 0) {
            res.statusCode = 400;
            let error = `Invalid or unsupported FHIR Resource`;
            res.json({
                "resourceType": "OperationOutcome",
                "id": "exception",
                "issue": [{
                    "severity": "error", "code": "exception",
                    "details": { "text": error }
                }]
            });
            return;
        }

        let { crossBorderId } = req.query;
        if (!crossBorderId) {
            res.statusCode = 400;
            let error = `Patient crossBorderId is required`;
            res.json({
                "resourceType": "OperationOutcome",
                "id": "exception",
                "issue": [{
                    "severity": "error", "code": "exception",
                    "details": { "text": error }
                }]
            });
            return;
        }
        let patient = await getPatientByCrossBorderId(String(crossBorderId));
        let error = `Cross Border Patient with the id ${crossBorderId} not found`
        if (!patient) {
            res.json({
                "resourceType": "OperationOutcome",
                "id": "exception",
                "issue": [{
                    "severity": "error", "code": "exception", "details": { "text": error }
                }]
            });
            return;
        }

        // Parse resources
        if (resource.subject) {
            resource.subject = await generatePatientReference("Patient", patient.id);
        }
        if (resource.patient) {
            resource.patient = await generatePatientReference("Patient", patient.id);
        }
        if (resource.reference) {
            resource.reference = await generatePatientReference("Patient", patient.id);
        }
        // Build resources

        // To-do: Hydrate resources


        // Post resource

        let data = await FhirApi({ url: `/${resourceType}`, method: 'POST', data: JSON.stringify(resource) })
        if (["Unprocessable Entity", "Bad Request"].indexOf(data.statusText) > 0) {
            res.statusCode = 400;
            res.json(data.data);
            return;
        }
        
        res.json(data.data);
        return;
    } catch (error) {
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


// modify patient details
router.post('/', async (req, res) => {
    try {
        let resource = req.body;
        let { crossBorderId } = req.query;
        if (!crossBorderId) {
            res.statusCode = 400;
            let error = `Patient crossBorderId is required`;
            res.json({
                "resourceType": "OperationOutcome",
                "id": "exception",
                "issue": [{
                    "severity": "error", "code": "exception",
                    "details": { "text": error }
                }]
            });
            return;
        }
        if (resource.resourceType === "Bundle") {
            resource.entry.map(async (item: any) => {
                let patient = await getPatientByCrossBorderId(String(crossBorderId));
                let error = `CrossBorder Patient with the id ${crossBorderId} not found`;
                if (!patient) {
                    res.json({
                        "resourceType": "OperationOutcome",
                        "id": "exception",
                        "issue": [{
                            "severity": "error", "code": "exception", "details": { "text": error }
                        }]
                    });
                    return;
                }
                if (item.subject) {
                    item.subject = await generatePatientReference("Patient", patient.id);
                }
                if (item.patient) {
                    item.patient = await generatePatientReference("Patient", patient.id);
                }
                if (item.reference) {
                    item.reference = await generatePatientReference("Patient", patient.id);
                }

            });

            let data = await FhirApi({ url: `/`, method: 'POST', data: JSON.stringify(resource) });
            if (["Unprocessable Entity", "Bad Request"].indexOf(data.statusText) > 0) {
                res.statusCode = 400;
                res.json(data.data);
                return;
            }
            res.json(data.data);
            return;
        }
        let patient = await getPatientByCrossBorderId(String(crossBorderId));
        if (!patient) {
            res.json({ status: "error", error: `Cross Border Patient with the id ${crossBorderId} not found` });
            return;
        }

        // Parse resources
        if (resource.subject) {
            resource.subject = generatePatientReference("Patient", patient.id);
        }
        if (resource.patient) {
            resource.patient = generatePatientReference("Patient", patient.id);
        }
        if (resource.reference) {
            resource.reference = generatePatientReference("Patient", patient.id);
        }

        let data = await FhirApi({ url: `/`, method: 'POST', data: JSON.stringify(resource) })
        if (["Unprocessable Entity", "Bad Request"].indexOf(data.statusText) > 0) {
            res.statusCode = 400;
            res.json(data.data);
            return;
        }
        res.json(data.data);
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