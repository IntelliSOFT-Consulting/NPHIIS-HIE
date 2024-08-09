import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { processIdentifiers } from './fhir';
import { FhirApi } from './utils';
import { vaccineCodes } from './vaccineCodes';

let MOH_LOGO = path.join(__dirname, 'MOH-Logo.png');

let _vaccineCodes: any = vaccineCodes();
// console.log()

let QR_BASE_URL = "https://chanjoke.intellisoftkenya.com/digital-certificates"

export async function generatePDF(vaccineCode: string, patient: any, documentRefId: string,isRoutine:boolean): Promise<string | null > {

    const vaccine = _vaccineCodes[vaccineCode];
    const doc = new PDFDocument({ margin: 50 });
    const IDs = await processIdentifiers(patient.identifier);
    
    const idType = Object.keys(IDs)[0];
    const idNumber = IDs[idType];
    const names = `${patient?.name[0]?.family} ${patient?.name[0]?.given[0]}${(patient?.name[0]?.given[1] ? " " + patient?.name[0]?.given[1] : '')}`;

    // Generate QR Code
    const qrCodeBuffer = await QRCode.toBuffer(`${QR_BASE_URL}/${documentRefId}/$validate`);
    const qrCodeWidth = 100;
    const qrCodeHeight = 100;

    // Logo
    const logoWidth = 200;
    const logoHeight = 150;
    const logoPath = MOH_LOGO;

    // Add logo
    doc.image(logoPath, doc.page.width / 2 - logoWidth / 2, doc.page.margins.top, { width: logoWidth, height: logoHeight });

    doc.moveDown(12.5);


    // Add some text 
    const text = `${isRoutine ? "" : vaccine + " "}VACCINATION CERTIFICATE`.toUpperCase();

    const textHeight = doc.heightOfString(text);
    const textStartY = doc.page.margins.top + logoHeight + 20; // Adjusted start position for the text
    doc.font('Helvetica-Bold').fontSize(16).text(text, { align: 'center' })


    // Add additional some text
    const vaccineText = isRoutine 
  ? "the following vaccines: " 
  : vaccine.split(" ")[0].toUpperCase();

    const additionalText = `This is to certify that ${names}, born on ${new Date(patient.birthDate).toLocaleDateString('en-GB').replace(/\/+/g, '-')}, from Kenya with 
    ${idType}: ${idNumber}, has been vaccinated against ${vaccineText} 
    on the date indicated in accordance with the National Health Regulations.`;
    const additionalTextHeight = doc.heightOfString(text);
    const additionalTextStartY = doc.page.margins.top + textStartY + 20; // Adjusted start position for the text
    doc.font('Helvetica').fontSize(12).text(additionalText, { align: 'center' })

    // doc.moveDown(1.5);
    // Add table
    const tableData = [
        ['Vaccine Name', 'No of doses', 'Date Administered'],
        // Add more rows as needed
    ];

    const baseUrl = `/Immunization?patient=Patient/${patient.id}`;
    const fullUrl = `${baseUrl}${isRoutine ? "&_sort=date" : `&vaccine-code=${vaccineCode}&_sort=date`}`;
     
    let vaccineData = (await FhirApi({ 
        // url: fullUrl,
        url: `/Immunization?patient=Patient/${patient.id}&vaccine-code=${vaccineCode}&_sort=date`, 
        headers:{"Cache-Control": 'no-cache'} })).data;
        console.log(vaccineData);
    if (!vaccineData?.entry){
        return null;
    }
    for (let vaccine of vaccineData?.entry) {
        tableData.push([vaccine?.resource?.vaccineCode?.text, vaccine?.resource?.doseQuantity?.value, new Date(vaccine?.resource?.occurrenceDateTime).toLocaleDateString('en-GB').replace(/\/+/g, '-') ])
    }

    let startX = doc.page.margins.left;
    let startY = doc.page.height - doc.page.margins.bottom - qrCodeHeight - 50; // Adjusted position to leave space for the QR code

    const columnWidths = [150, 150, 150]; // Adjust column widths as needed
    const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);
    startX = doc.page.width / 2 - tableWidth / 2;
    startY = doc.page.height - doc.page.margins.bottom - qrCodeHeight - (150 + 100);




    const drawTable = (doc: any, tableData: any, startX: any, startY: any, columnWidths: any) => {
        doc.font('Helvetica-Bold').fontSize(10);

        // Draw headers
        tableData[0].forEach((header: any, i: any) => {
            doc.text(header, startX + (columnWidths[i] * i), startY, { width: columnWidths[i], align: 'left' });
        });

        startY += 20;

        // Draw rows
        tableData.slice(1).forEach((row: any) => {
            row.forEach((cell: any, i: any) => {
                doc.text(cell, startX + (columnWidths[i] * i), startY, { width: columnWidths[i], align: 'left' });
            });
            startY += 20;
        });
    };

    drawTable(doc, tableData, startX, startY, columnWidths);



    // Add QR Code
    doc.image(qrCodeBuffer, doc.page.width / 2 - qrCodeWidth / 2, doc.page.height - doc.page.margins.bottom - qrCodeHeight, { width: qrCodeWidth, height: qrCodeHeight });

    doc.end();

    return new Promise<string>((resolve, reject) => {
        const buffers: Buffer[] = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
            const concatenatedBuffer = Buffer.concat(buffers);
            const base64String = concatenatedBuffer.toString('base64');
            resolve(base64String);
        });
        doc.on('error', reject);
    });
}


export async function savePDFToFileSystem(base64String: string, filePath: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const buffer = Buffer.from(base64String, 'base64');
        fs.writeFile(filePath, buffer, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}




// // Example usage
// const outputFile = 'output.pdf';
// const patient = pa
// // Change this to your desired output file path
// generatePDF("Malaria", "1", "33")
//   .then((pdfBuffer) => savePDFToFileSystem(pdfBuffer, outputFile))
//   .then(() => {
//     console.log('PDF saved to file:', outputFile);
//   })
//   .catch((err) => {
//     console.error('Error generating or saving PDF:', err);
//   });