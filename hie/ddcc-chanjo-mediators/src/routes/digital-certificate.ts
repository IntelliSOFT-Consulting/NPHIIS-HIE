import express, { json } from "express";
import { FhirApi } from "../lib/utils";
import { v4 as uuid } from "uuid";
import {
  createBinary,
  createComposition,
  createDocument,
  createDocumentRef,
  createDocumentRefQR,
  createOrganization,
  getVaccineFolder,
} from "../lib/fhir";
import {
  generateCombinedPDF,
  generatePDF,
  savePDFToFileSystem,
} from "../lib/generatePDF";
import {
  vaccineCodes,
  nonRoutineVaccince,
  routineRefinedVaccines,
  nonRoutineRefinedVaccines,
} from "../lib/vaccineCodes";

export const router = express.Router();
router.use(express.json());

const _vaccineCodes: any = vaccineCodes();

const _nonRoutineVaccince: any = nonRoutineVaccince();
//Create a Universal Certification
router.post("/", async (req, res) => {
  try {
    let data = req.body;
    let patientId = data?.subject?.reference ?? data?.patient?.reference;
    let immunizationId = data.id;
    let vaccineCode = data?.vaccineCode?.coding[0]?.code;
    let vaccineName = _vaccineCodes[vaccineCode];
    if (!vaccineName) {
      res.statusCode = 400;
      res.json({
        resourceType: "OperationOutcome",
        id: "exception",
        issue: [
          {
            severity: "error",
            code: "exception",
            details: { text: String("Invalid vaccine code provided") },
          },
        ],
      });
      return;
    }

    /**
     * Only Generate certificate for completed resources
     * 
     */
console.log(data.status);

if(data.status!='completed'){
  res.statusCode = 200;
      res.json({
        resourceType: "OperationOutcome",
        id: "exception",
        issue: [
          {
            severity: "error",
            code: "exception",
            details: { text: String("Operation only valid for completed Immunizations") },
          },
        ],
      });
      return;
}


    let isRoutine = false;
    // Check if the Code matches any non-routine from the list
    if (_nonRoutineVaccince.hasOwnProperty(vaccineCode)) {
      //Here we consider the specific vaccine
      console.log("working with non routine immunization....");
      isRoutine = false;
    } else {
      //Pull all Immunization Records for the said patient 👱
      console.log("looking for a routine immunization details...");
      isRoutine = true;
    }
    console.log("final message .... " + isRoutine);
    console.log(vaccineCode, vaccineName);
    patientId = String(patientId).split("/")[1];
    let patient = await (await FhirApi({ url: `/Patient/${patientId}` })).data;
    if (patient.resourceType === "OperationOutcome") {
      res.statusCode = 400;
      res.json(patient);
      return;
    }

    // begin processing cert workflow
    let locationId = data?.location?.reference.split("/")[1];
    let location = (await FhirApi({ url: `/Location/${locationId}` })).data;

    // get/create vaccine folder and add a new document reference for this immunization
    let vaccineFolder = await getVaccineFolder(patientId, vaccineCode);
    console.log(vaccineFolder);

    let docRefId = uuid();

    // create certificate PDF
    let pdfFile = await generateCombinedPDF(
      vaccineCode,
      patient,
      docRefId,
      isRoutine
    );
    console.log(pdfFile);
    if (!pdfFile) {
      res.json({
        resourceType: "OperationOutcome",
        id: "exception",
        issue: [
          {
            severity: "error",
            code: "exception",
            details: {
              text: String("PDF generation failed"),
            },
          },
        ],
      });
      return;
    }
    savePDFToFileSystem(
      pdfFile,
      `${patientId}-${isRoutine ? `routine` : `${vaccineName}`}.pdf`.replace(
        "/",
        "-"
      )
    );

    // save pdf image to FHIR Server
    let docRefQR = await createDocumentRefQR(
      patientId,
      locationId,
      pdfFile,
      vaccineCode,
      docRefId
    );

    // create Document/Bundle to attach to DocumentRef above
    let composition = await createComposition(data.id);
    let organization = await createOrganization(location);
    let document = await createDocument(
      composition,
      patient,
      organization,
      docRefQR
    );
    let docRef = await createDocumentRef(patientId, document.id, vaccineCode);

    // update folder - fetch all documentReferences and attach here
    let docRefs = await (
      await FhirApi({
        url: `/DocumentReference?_profile=StructureDefinition/DigitalCertificateDocumentReference&subject=${patientId}&type:code=${vaccineCode}`,
        headers: { "Cache-Control": "no-cache" },
      })
    ).data;
    // let previousImmunizations = [];
    let previousImmunizations =
      docRefs?.entry?.map((i: any) => {
        return {
          item: {
            reference: `${i?.resource?.resourceType}/${i?.resource?.id}`,
          },
        };
      }) ?? [];
    console.log(previousImmunizations);
    let updatedFolder = await (
      await FhirApi({
        url: `/List/${vaccineFolder.id}`,
        method: "PUT",
        data: JSON.stringify({
          ...vaccineFolder,
          entry: previousImmunizations,
        }),
      })
    ).data;
    console.log(updatedFolder);
    res.statusCode = 200;
    res.json(updatedFolder);
    return;
  } catch (error) {
    res.statusCode = 400;
    console.log(error);
    res.json({
      resourceType: "OperationOutcome",
      id: "exception",
      issue: [
        {
          severity: "error",
          code: "exception",
          details: {
            text: JSON.stringify(error),
          },
        },
      ],
    });
    return;
  }
});
router.post(
  "/generate-all-possible-immunizations",
  async (request, response) => {
    try {
      let data = request.body;
      let patientId = data?.subject?.reference ?? data?.patient?.reference;
      let immunizationId = data.id;
      let vaccineCode = data?.vaccineCode?.coding[0]?.code;
      let vaccineName = _vaccineCodes[vaccineCode];
      //Loop through
      const immunizations = [];
      console.log("routine starts here *****");
      console.log(routineRefinedVaccines);
      console.log("non routine starts here *****");
      console.log(nonRoutineRefinedVaccines);

      routineRefinedVaccines.forEach(async (vaccine) => {
        const immunization = {
          resourceType: "Immunization",
          id: uuid(), // Generating a unique ID for each immunization
          meta: {
            versionId: "1",
            lastUpdated: new Date().toISOString(),
            source: "#ZlzYznvyr6A6ulzh", // Example source; replace with actual source if needed
          },
          status: "completed",
          vaccineCode: {
            coding: [
              {
                code: vaccine.nhddCode,
                display: vaccine.vaccineCode, // Adjust the display name as needed
              },
            ],
            text: vaccine.vaccineName,
          },
          patient: {
            reference: "Patient/7fc8e9ed-09e2-4d7d-949f-3f554c7c61b2", // Replace with actual patient reference
          },
          occurrenceDateTime: new Date().toISOString(),
          recorded: new Date().toISOString(),
          location: {
            reference: "Location/24979", // Replace with actual location reference
          },
          lotNumber: "HDKKD8777847", // Example lot number; replace with actual value if needed
          doseQuantity: {
            value: vaccine.doseNumber,
            unit: "0",
            system: "http://unitsofmeasure.org",
          },
          performer: [
            {
              actor: {
                reference: "Practitioner/1c69e2b6-bbf3-4695-8c3e-0640a37b8f28", // Replace with actual practitioner reference
              },
            },
            {
              function: {
                coding: [
                  {
                    code: "PP",
                    display: "Primary performer",
                  },
                ],
              },
            },
          ],
        };

        const params = {
          url: "/Immunization", // The FHIR API endpoint for Immunization resources
          method: "POST",
          data: JSON.stringify(immunization), // Stringify the JSON object for the body
          // headers: {
          //     'Authorization': 'Bearer YOUR_ACCESS_TOKEN' // Include any necessary headers, like authorization
          // }
        };

        try {
          const result = await FhirApi(params);

          console.log("POST request successful:", result);
        } catch (error) {
          console.error("Error making POST request:", error);
        }
      });
      console.log("successfully created all the immunizations ****");
    } catch (error) {
      response.statusCode = 400;
      console.log(error);
      response.json({
        resourceType: "OperationOutcome",
        id: "exception",
        issue: [
          {
            severity: "error",
            code: "exception",
            details: {
              text: JSON.stringify(error),
            },
          },
        ],
      });
      return;
    }
  }
);

// id maps to a FHIR List / Folder
router.get("/validate/:id", async (req, res) => {
  try {
    const id = req.params.id;

    //Pull FHIR Document
    const certificate = await FhirApi({
      url: `/DocumentReference/${id}`,
      headers: { "Cache-Control": "no-cache" },
    });
    console.log(certificate);
    if (!certificate) {
      res.statusCode = 404;
      res.json({
        resourceType: "OperationOutcome",
        id: "exception",
        issue: [
          {
            severity: "error",
            code: "exception",
            details: { text: String("Invalid Certificate ID provided") },
          },
        ],
      });
      return;
    }
    const data =certificate.data; 
    const base64Data = data?.content[0].attachment.data; 
    // Decode the Base64 string
    const decodedData = Buffer.from(base64Data, "base64");
    console.log("Decoded Data:", decodedData);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="certificate.pdf"`);
    res.send(decodedData);
    return;
  } catch (error) {
    res.statusCode = 400;
    console.log(error);
    res.json({
      resourceType: "OperationOutcome",
      id: "exception",
      issue: [
        {
          severity: "error",
          code: "exception",
          details: {
            text: JSON.stringify(error),
          },
        },
      ],
    });
    return;
  }
});

export default router;
