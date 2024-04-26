import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { processIdentifiers } from './fhir';

let MOH_LOGO= path.join(__dirname, 'MOH-Logo.png');
// console.log()

let QR_BASE_URL = "https://chanjoke.intellisoftkenya.com/digital-certificates"


//vaccine, 


export async function generatePDF(vaccine: string, patient: any, documentRefId: string): Promise<string> {
  const doc = new PDFDocument({ margin: 50 });

  const IDs = await processIdentifiers(patient.identifier);
  const idType = Object.keys(IDs)[0];
  const idNumber = IDs[idType];
  const names = `${patient.name[0].family} ${patient.name[0].given[0]} (${patient.name[0].given[1]} ?? '')`;

  // Generate QR Code
  const qrCodeBuffer = await QRCode.toBuffer(`${QR_BASE_URL}/${documentRefId}`);
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
   const text = `${vaccine.toUpperCase()} VACCINATION CERTIFICATE`;
   const textHeight = doc.heightOfString(text);
   const textStartY = doc.page.margins.top + logoHeight + 20; // Adjusted start position for the text
   doc.font('Helvetica-Bold').fontSize(16).text(text, { align: 'center' })
   
   
    // Add additional some text
   const additionalText = `This is to certify that ${names}, born on ${patient.dob}, from Kenya with 
    ${idType}: ${idNumber}, has been vaccinated against ${vaccine.toUpperCase()}
    on the date indicated in accordance with the National Health Regulations.`;
   const additionalTextHeight = doc.heightOfString(text);
   const additionalTextStartY = doc.page.margins.top + textStartY + 20; // Adjusted start position for the text
   doc.font('Helvetica-Bold').fontSize(16).text(additionalText, { align: 'center' })

   doc.moveDown(3.5);
  // Add table
  const tableData = [
    ['Vaccine Name', 'No of doses', 'Data Administered'],
    ['Vaccine A', '2', '2024-04-15'],
    ['Vaccine B', '1', '2024-04-16']
    // Add more rows as needed
  ];
  const tableTop = doc.y;
  const columnWidths = [150, 100, 150];
  const cellPadding = 10;
  const startY = tableTop;
  const startX = doc.page.width / 2 - (columnWidths.reduce((a, b) => a + b, 0) / 2);

  // Calculate the height of a row
  const rowHeight = 20;

  // Draw table headers
  let currentY = startY;
  for (let i = 0; i < tableData[0].length; i++) {
    doc.rect(startX, currentY, columnWidths[i], rowHeight).fillAndStroke('#d3d3d3', '#000000');
    doc.text(tableData[0][i], startX + cellPadding, currentY + cellPadding, { width: columnWidths[i] - (cellPadding * 2), align: 'left' });
  }

  doc.moveDown(1.5);

  // Draw table rows
  for (let i = 1; i < tableData.length; i++) {
    currentY += rowHeight;
    for (let j = 0; j < tableData[i].length; j++) {
      doc.rect(startX, currentY, columnWidths[j], rowHeight).stroke();
      doc.text(tableData[i][j], startX + cellPadding, currentY + cellPadding, { width: columnWidths[j] - (cellPadding * 2), align: 'left' });
    }
  }

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
// generatePDF("Malaria")
//   .then((pdfBuffer) => savePDFToFileSystem(pdfBuffer, outputFile))
//   .then(() => {
//     console.log('PDF saved to file:', outputFile);
//   })
//   .catch((err) => {
//     console.error('Error generating or saving PDF:', err);
//   });