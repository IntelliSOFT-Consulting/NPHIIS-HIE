import express from 'express';
import { FhirApi } from '../lib/utils';
import { v4 as uuid } from 'uuid';
import fetch from 'node-fetch';
import { createComposition, createDocument, createDocumentRef, getVaccineFolder } from '../lib/fhir';

export const router = express.Router();

router.use(express.json());

// get posted Immunization resource
// extract patient & immunization

router.post('/', async (req, res) => {
    try {
        let data = req.body;
        let patientId = data?.subject?.reference;
        let vaccineCode = data?.vaccineCode?.coding[0]?.code;
        patientId = String(patientId).split('/')[1];
        let doseQuantity = data?.doseQuantity?.value;

        let locationId = data?.location?.reference.split('/');

        // get/create vaccine folder and add a new document reference for this immunization
        let vaccineFolderId = await getVaccineFolder(patientId, vaccineCode);
        let docRef = await createDocumentRef(patientId, vaccineFolderId);

        // create document, add compostion and other resources.
        let composition = await createComposition(data.id);
        let doc = await createDocument(patientId, docRef, composition);
        res.statusCode = 400;
        // res.json(patient);
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
                    "text": String(error)
                }
            }]
        });
        return;
    }
});

router.get('/:id', async (req, res) => {
    try {
        let data = req.body;

        // check headers or param for required response type.
        let patientId = data?.subject?.reference;
        let vaccineCode = data?.vaccineCode?.coding[0]?.code;
        patientId = String(patientId).split('/')[1];
        let doseQuantity = data?.doseQuantity?.value;

        let locationId = data?.location?.reference.split('/');

        let vaccineFolderId = await getVaccineFolder(patientId, vaccineCode);


        res.statusCode = 400;
        // res.json(patient);
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
                    "text": String(error)
                }
            }]
        });
        return;
    }
});


export default router;