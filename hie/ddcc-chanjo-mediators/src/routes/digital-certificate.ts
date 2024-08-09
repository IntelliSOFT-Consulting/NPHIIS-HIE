import express, { json } from 'express';
import { FhirApi } from '../lib/utils';
import { v4 as uuid } from 'uuid';
import { createBinary, createComposition, createDocument, createDocumentRef, createDocumentRefQR, createOrganization, getVaccineFolder } from '../lib/fhir';
import { generatePDF, savePDFToFileSystem } from '../lib/generatePDF';
import { vaccineCodes,nonRoutineVaccince } from '../lib/vaccineCodes';
import { Console } from 'console';

export const router = express.Router();
router.use(express.json());

const _vaccineCodes: any = vaccineCodes();

const _nonRoutineVaccince: any = nonRoutineVaccince();
//Create a Universal Certification
router.post('/', async (req, res) => {
    try {
        let data = req.body;
        let patientId = data?.subject?.reference ?? data?.patient?.reference;
        let immunizationId = data.id;
        let vaccineCode = data?.vaccineCode?.coding[0]?.code;
        let vaccineName = _vaccineCodes[vaccineCode];
        if (!vaccineName) {
            res.statusCode = 400;
            res.json({
                "resourceType": "OperationOutcome",
                "id": "exception",
                "issue": [{
                    "severity": "error",
                    "code": "exception",
                    "details": { "text": String("Invalid vaccine code provided") }
                }]
            });
            return;
        }

        let isRoutine=false;
        // Check if the Code matches any non-routine from the list
        if (_nonRoutineVaccince.hasOwnProperty(vaccineCode)) {
             //Here we consider the specific vaccine
             console.log('working with non routing immunization....')
             isRoutine=false;
        } else {
             //Pull all Immunization Records for the said patient 👱
             console.log('looking for a routine immunization details...')
             isRoutine=true
        }
        console.log('final message .... '+isRoutine);
        console.log(vaccineCode, vaccineName);
        patientId = String(patientId).split('/')[1];
        let patient = await (await FhirApi({ url: `/Patient/${patientId}` })).data;
        if (patient.resourceType === 'OperationOutcome') {
            res.statusCode = 400;
            res.json(patient);
            return;
        }

        // begin processing cert workflow
        let locationId = data?.location?.reference.split('/')[1];
        let location = (await FhirApi({ url: `/Location/${locationId}` })).data;

        // get/create vaccine folder and add a new document reference for this immunization
        let vaccineFolder = await getVaccineFolder(patientId, vaccineCode);
        console.log(vaccineFolder);

        let docRefId = uuid();

        // create certificate PDF
        let pdfFile = await generatePDF(vaccineCode, patient, docRefId,isRoutine);
        console.log(pdfFile);
        if(!pdfFile){
            res.json({
                "resourceType": "OperationOutcome",
                "id": "exception",
                "issue": [{
                    "severity": "error",
                    "code": "exception",
                    "details": {
                        "text": String("PDF generation failed")
                    }
                }]
            });
            return;
        }
        savePDFToFileSystem(pdfFile, `${patientId}-${vaccineName}.pdf`.replace("/", '-'));

        // save pdf image to FHIR Server
        let docRefQR = await createDocumentRefQR(patientId, locationId, pdfFile, vaccineCode);

        // create Document/Bundle to attach to DocumentRef above
        let composition = await createComposition(data.id);
        let organization = await createOrganization(location);
        let document = await createDocument(composition, patient, organization, docRefQR);
        let docRef = await createDocumentRef(patientId, document.id, vaccineCode);
 
        // update folder - fetch all documentReferences and attach here
        let docRefs = await (await FhirApi({ url: `/DocumentReference?_profile=StructureDefinition/DigitalCertificateDocumentReference&subject=${patientId}&type:code=${vaccineCode}`,
                            headers:{"Cache-Control": 'no-cache'}})).data;
        // let previousImmunizations = [];
        let previousImmunizations = docRefs?.entry?.map((i: any) => {
            return { item: { reference: `${i?.resource?.resourceType}/${i?.resource?.id}` } }
        }) ?? [];
        console.log(previousImmunizations);
        let updatedFolder = await (await FhirApi({ url: `/List/${vaccineFolder.id}`, method: "PUT", data: JSON.stringify({ ...vaccineFolder, entry: previousImmunizations }) })).data;
        console.log(updatedFolder);
        res.statusCode = 200;
        res.json(updatedFolder);
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
                    "text": JSON.stringify(error)
                }
            }]
        });
        return;
    }
});

router.post('/reference', async (req, res) => {
    try {
        let data = req.body;
        let patientId = data?.subject?.reference ?? data?.patient?.reference;
        let immunizationId = data.id;
        let vaccineCode = data?.vaccineCode?.coding[0]?.code;
        let vaccineName = _vaccineCodes[vaccineCode];

        // // get all composition resources for this patient & vaccine code  - avoid regeneration of resources
        // let compositions = await (await FhirApi({ url: `/Composition?subject=${patientId}&type:code=${vaccineCode}` })).data;
        // if (compositions?.entry) {
        //     compositions = compositions.entry.map((i: any) => {
        //         return i.resource?.section?.[0]?.entry?.[0]?.reference.split('/')[1];
        //     });
        //     if (compositions.indexOf(immunizationId) > -1) {
        //         let vaccineFolder = await getVaccineFolder(patientId, vaccineCode);
        //         let docRefs = await (await FhirApi({ 
        //             url: `/DocumentReference?_profile=StructureDefinition/DigitalCertificateDocumentReference&subject=${patientId}`,
        //             headers:{"Cache-Control":"no-cache"}})).data;
        //         let previousImmunizations = docRefs?.entry?.map((i: any) => {
        //             return { item: { reference: `${i?.resource?.resourceType}/${i?.resource?.id}` } }
        //         }) ?? [];
        //         // console.log("docRefs:", previousImmunizations);
        //         let updatedFolder = await (await FhirApi({ url: `/List/${vaccineFolder.id}`, method: "PUT", data: JSON.stringify({ ...vaccineFolder, entry: previousImmunizations }) })).data;
        //         console.log(updatedFolder);
        //         res.statusCode = 200;
        //         res.json({
        //             "resourceType": "OperationOutcome",
        //             "id": "certificate-already-exists",
        //             "issue": [{
        //                 "severity": "information",
        //                 "code": "certificate-already-exists",
        //                 "details": {
        //                     "text": String("Certificate was already generated")
        //                 }
        //             }]
        //         });
        //         return;
        //     }
        // }

        if (!vaccineName) {
            res.statusCode = 400;
            res.json({
                "resourceType": "OperationOutcome",
                "id": "exception",
                "issue": [{
                    "severity": "error",
                    "code": "exception",
                    "details": { "text": String("Invalid vaccine code provided") }
                }]
            });
            return;
        }
        console.log(vaccineCode, vaccineName);
        patientId = String(patientId).split('/')[1];
        let patient = await (await FhirApi({ url: `/Patient/${patientId}` })).data;
        if (patient.resourceType === 'OperationOutcome') {
            res.statusCode = 400;
            res.json(patient);
            return;
        }

        // begin processing cert workflow
        let locationId = data?.location?.reference.split('/')[1];
        let location = (await FhirApi({ url: `/Location/${locationId}` })).data;

        // get/create vaccine folder and add a new document reference for this immunization
        let vaccineFolder = await getVaccineFolder(patientId, vaccineCode);
        console.log(vaccineFolder);

        let docRefId = uuid();

        // create certificate PDF
        let pdfFile = await generatePDF(vaccineCode, patient, docRefId,true);
        if(!pdfFile){
            res.json({
                "resourceType": "OperationOutcome",
                "id": "exception",
                "issue": [{
                    "severity": "error",
                    "code": "exception",
                    "details": {
                        "text": String("PDF generation failed")
                    }
                }]
            });
            return;
        }
        savePDFToFileSystem(pdfFile, `${patientId}-${vaccineName}.pdf`.replace("/", '-'));

        // save pdf image to FHIR Server
        let docRefQR = await createDocumentRefQR(patientId, locationId, pdfFile, vaccineCode);

        // create Document/Bundle to attach to DocumentRef above
        let composition = await createComposition(data.id);
        let organization = await createOrganization(location);
        let document = await createDocument(composition, patient, organization, docRefQR);
        let docRef = await createDocumentRef(patientId, document.id, vaccineCode);


        // let binaryId  = await createBinary(pdfFile);
        // console.log(binaryId)

        // update folder - fetch all documentReferences and attach here
        let docRefs = await (await FhirApi({ url: `/DocumentReference?_profile=StructureDefinition/DigitalCertificateDocumentReference&subject=${patientId}&type:code=${vaccineCode}`,
                            headers:{"Cache-Control": 'no-cache'}})).data;
        // let previousImmunizations = [];
        let previousImmunizations = docRefs?.entry?.map((i: any) => {
            return { item: { reference: `${i?.resource?.resourceType}/${i?.resource?.id}` } }
        }) ?? [];
        console.log(previousImmunizations);
        let updatedFolder = await (await FhirApi({ url: `/List/${vaccineFolder.id}`, method: "PUT", data: JSON.stringify({ ...vaccineFolder, entry: previousImmunizations }) })).data;
        console.log(updatedFolder);
        res.statusCode = 200;
        res.json(updatedFolder);
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
                    "text": JSON.stringify(error)
                }
            }]
        });
        return;
    }
});


// id maps to a FHIR List / Folder 
router.get('/:id/$validate', async (req, res) => {
    try {
        let data = req.body;

        // check headers or param for required response type.

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
                    "text": JSON.stringify(error)
                }
            }]
        });
        return;
    }
});


export default router;