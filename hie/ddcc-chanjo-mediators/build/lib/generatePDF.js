"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.savePDFToFileSystem = exports.generatePDF = void 0;
const pdfkit_1 = __importDefault(require("pdfkit"));
const qrcode_1 = __importDefault(require("qrcode"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const fhir_1 = require("./fhir");
let MOH_LOGO = path_1.default.join(__dirname, 'MOH-Logo.png');
// console.log()
let QR_BASE_URL = "https://chanjoke.intellisoftkenya.com/digital-certificates";
function generatePDF(vaccine, patient, documentRefId) {
    return __awaiter(this, void 0, void 0, function* () {
        const doc = new pdfkit_1.default({ margin: 50 });
        const IDs = yield fhir_1.processIdentifiers(patient.identifier);
        const idType = Object.keys(IDs)[0];
        const idNumber = IDs[idType];
        const names = `${patient.name[0].family} ${patient.name[0].given[0]} (${patient.name[0].given[1]} ?? '')`;
        // Generate QR Code
        const qrCodeBuffer = yield qrcode_1.default.toBuffer(`${QR_BASE_URL}/${documentRefId}/$validate`);
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
        const text = `${vaccine.split(" ")[0].toUpperCase()} VACCINATION CERTIFICATE`;
        const textHeight = doc.heightOfString(text);
        const textStartY = doc.page.margins.top + logoHeight + 20; // Adjusted start position for the text
        doc.font('Helvetica-Bold').fontSize(16).text(text, { align: 'center' });
        // Add additional some text
        const additionalText = `This is to certify that ${names}, born on ${patient.dob}, from Kenya with 
    ${idType}: ${idNumber}, has been vaccinated against ${vaccine.split(" ")[0].toUpperCase()}
    on the date indicated in accordance with the National Health Regulations.`;
        const additionalTextHeight = doc.heightOfString(text);
        const additionalTextStartY = doc.page.margins.top + textStartY + 20; // Adjusted start position for the text
        doc.font('Helvetica').fontSize(12).text(additionalText, { align: 'center' });
        doc.moveDown(2.5);
        // Add table
        const tableData = [
            ['Vaccine Name', 'No of doses', 'Data Administered'],
            ['Vaccine A', '2', '2024-04-15'],
            ['Vaccine B', '1', '2024-04-16']
            // Add more rows as needed
        ];
        const startX = doc.page.margins.left;
        const startY = doc.page.height - doc.page.margins.bottom - qrCodeHeight - 50; // Adjusted position to leave space for the QR code
        const columnWidths = [150, 150, 150]; // Adjust column widths as needed
        const drawTable = (doc, tableData, startX, startY, columnWidths) => {
            doc.font('Helvetica-Bold').fontSize(10);
            // Draw headers
            tableData[0].forEach((header, i) => {
                doc.text(header, startX + (columnWidths[i] * i), startY, { width: columnWidths[i], align: 'left' });
            });
            startY += 20;
            // Draw rows
            tableData.slice(1).forEach((row) => {
                row.forEach((cell, i) => {
                    doc.text(cell, startX + (columnWidths[i] * i), startY, { width: columnWidths[i], align: 'left' });
                });
                startY += 20;
            });
        };
        drawTable(doc, tableData, startX, startY, columnWidths);
        // Add QR Code
        doc.image(qrCodeBuffer, doc.page.width / 2 - qrCodeWidth / 2, doc.page.height - doc.page.margins.bottom - qrCodeHeight, { width: qrCodeWidth, height: qrCodeHeight });
        doc.end();
        return new Promise((resolve, reject) => {
            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                const concatenatedBuffer = Buffer.concat(buffers);
                const base64String = concatenatedBuffer.toString('base64');
                resolve(base64String);
            });
            doc.on('error', reject);
        });
    });
}
exports.generatePDF = generatePDF;
function savePDFToFileSystem(base64String, filePath) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            const buffer = Buffer.from(base64String, 'base64');
            fs_1.default.writeFile(filePath, buffer, (err) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        });
    });
}
exports.savePDFToFileSystem = savePDFToFileSystem;
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
