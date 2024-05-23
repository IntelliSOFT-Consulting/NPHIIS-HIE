import express from 'express';
import { FhirApi } from '../lib/utils';
import { v4 as uuid } from 'uuid';
import fetch from 'node-fetch';
import { getVaccineFolder } from '../lib/fhir';

export const router = express.Router();

router.use(express.json());

// get posted Immunization resource
// extract patient & immunization
//process FHIR beneficiary
router.put('/Immunization/:id', async (req, res) => {
    try {
        let { id } = req.params;
        let data = await (await FhirApi({url: `/Immunization/${id}`})).data
        let DIGITAL_CERT_MEDIATOR_ENDPOINT = process.env['DIGITAL_CERT_MEDIATOR_ENDPOINT'] ?? "";
        let OPENHIM_CLIENT_ID = process.env['OPENHIM_CLIENT_ID'] ?? "";
        let OPENHIM_CLIENT_PASSWORD = process.env['OPENHIM_CLIENT_PASSWORD'] ?? "";
        let response = await (await fetch(DIGITAL_CERT_MEDIATOR_ENDPOINT, {
            body: JSON.stringify(data),
            method: "POST",
            headers:{"Content-Type":"application/json",
            "Authorization": 'Basic ' + Buffer.from(OPENHIM_CLIENT_ID + ':' + OPENHIM_CLIENT_PASSWORD).toString('base64')}
        })).json()
        console.log(response)
          if(response.code >= 400){
            res.statusCode = response.code;
            res.json({
              "resourceType": "OperationOutcome",
              "id": "exception",
              "issue": [{
                  "severity": "error",
                  "code": "exception",
                  "details": {
                      "text": `Failed to initiate certificate generation - ${JSON.stringify(response)}`
                  }
              }]
            });
            return;
          }
          res.statusCode = 200;
          res.json(data);
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
                    "text": `Failed to initiate certificate generation - ${JSON.stringify(error)}`
                }
            }]
        });
        return;
    }
});

export default router;