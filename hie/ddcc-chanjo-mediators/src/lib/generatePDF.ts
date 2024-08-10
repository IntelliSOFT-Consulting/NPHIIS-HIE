import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import path from "path";
import fs from "fs";
import { processIdentifiers } from "./fhir";
import { FhirApi } from "./utils";
import { nonRoutineVaccince, vaccineCodes } from "./vaccineCodes";

let MOH_LOGO = path.join(__dirname, "MOH-Logo.png");

let _vaccineCodes: any = vaccineCodes();
// console.log()

const _nonRoutineVaccinces: any = nonRoutineVaccince();

let QR_BASE_URL = "https://chanjoke.intellisoftkenya.com/digital-certificates";

export async function generatePDF(
  vaccineCode: string,
  patient: any,
  documentRefId: string
): Promise<string | null> {
  try {
    console.log("Starting PDF generation...");

    const vaccine = _vaccineCodes[vaccineCode];
    console.log("Vaccine code resolved:", vaccine);

    const doc = new PDFDocument({ margin: 50 });
    const IDs = await processIdentifiers(patient.identifier);
    console.log("Processed patient identifiers:", IDs);

    const idType = Object.keys(IDs)[0];
    const idNumber = IDs[idType];
    const names = `${patient?.name[0]?.family} ${patient?.name[0]?.given[0]}${
      patient?.name[0]?.given[1] ? " " + patient?.name[0]?.given[1] : ""
    }`;
    console.log("Patient name and ID details:", { names, idType, idNumber });

    // Prepare QR Code
    const qrCodeBuffer = await QRCode.toBuffer(
      `${QR_BASE_URL}/${documentRefId}/$validate`
    );
    console.log("Generated QR Code.");

    const qrCodeWidth = 100;
    const qrCodeHeight = 100;

    // Prepare Logo
    const logoWidth = 200;
    const logoHeight = 150;
    const logoPath = MOH_LOGO;
    console.log("Logo settings prepared.");

    // Pipe document to buffer array
    const buffers: Buffer[] = [];
    doc.on("data", buffers.push.bind(buffers));

    // Add logo
    doc.image(
      logoPath,
      doc.page.width / 2 - logoWidth / 2,
      doc.page.margins.top,
      { width: logoWidth, height: logoHeight }
    );
    doc.moveDown(12.5);
    console.log("Added logo to PDF.");

    // Add title text
    const text = `${vaccine} VACCINATION CERTIFICATE`.toUpperCase();
    doc.font("Helvetica-Bold").fontSize(16).text(text, { align: "center" });
    console.log("Added title text to PDF.");

    // Add additional text
    const additionalText = `This is to certify that ${names}, born on ${new Date(
      patient.birthDate
    )
      .toLocaleDateString("en-GB")
      .replace(
        /\/+/g,
        "-"
      )}, from Kenya with ${idType}: ${idNumber}, has been vaccinated against ${vaccine
      .split(" ")[0]
      .toUpperCase()} on the date indicated in accordance with the National Health Regulations.`;
    doc
      .font("Helvetica")
      .fontSize(12)
      .text(additionalText, { align: "center", continued: false });
    console.log("Added additional text to PDF.");

    // Add table
    const tableData = [
      ["Vaccine Name", "No of doses", "Date Administered"],
      // Add more rows as needed
    ];
    console.log("Initialized table data.");
    // let baseUrl=`/Immunization?patient=${patient.id}&vaccine-code=${vaccineCode}&_sort=date`
    let baseUrl = `/Immunization?patient=${patient.id}&_sort=date`;

    const vaccineData = (
      await FhirApi({
        url: baseUrl,
        headers: { "Cache-Control": "no-cache" },
      })
    ).data;
    console.log("Fetched vaccine data from FHIR API:", vaccineData);

    if (!vaccineData?.entry) {
      console.log("No vaccine data found.");
      return null;
    }

    for (let vaccine of vaccineData?.entry) {
      tableData.push([
        vaccine?.resource?.vaccineCode?.text,
        vaccine?.resource?.doseQuantity?.value,
        new Date(vaccine?.resource?.occurrenceDateTime)
          .toLocaleDateString("en-GB")
          .replace(/\/+/g, "-"),
      ]);
    }
    console.log("Populated table data:", tableData);

    const columnWidths = [150, 150, 150];
    const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);
    let startX = doc.page.width / 2 - tableWidth / 2;
    let startY =
      doc.page.height - doc.page.margins.bottom - qrCodeHeight - (150 + 100);
    console.log("Calculated table positioning:", { startX, startY });

    const drawTable = (
      doc: PDFKit.PDFDocument,
      tableData: any[],
      startX: number,
      startY: number,
      columnWidths: number[]
    ) => {
      console.log("Drawing table...");
      doc.font("Helvetica-Bold").fontSize(10);

      // Draw headers
      tableData[0].forEach((header: any, i: any) => {
        doc.text(header, startX + columnWidths[i] * i, startY, {
          width: columnWidths[i],
          align: "left",
        });
      });

      startY += 20;

      // Draw rows
      tableData.slice(1).forEach((row) => {
        row.forEach((cell: any, i: any) => {
          doc.text(cell, startX + columnWidths[i] * i, startY, {
            width: columnWidths[i],
            align: "left",
          });
        });
        startY += 20;
      });
      console.log("Table drawn successfully.");
    };

    drawTable(doc, tableData, startX, startY, columnWidths);

    // Add QR Code
    doc.image(
      qrCodeBuffer,
      doc.page.width / 2 - qrCodeWidth / 2,
      doc.page.height - doc.page.margins.bottom - qrCodeHeight,
      { width: qrCodeWidth, height: qrCodeHeight }
    );
    console.log("Added QR code to PDF.");

    // Finalize PDF file
    doc.end();

    // Return PDF as base64 string
    console.log("Finalizing PDF...");
    return new Promise<string>((resolve, reject) => {
      doc.on("end", () => {
        const concatenatedBuffer = Buffer.concat(buffers);
        const base64String = concatenatedBuffer.toString("base64");
        console.log("PDF generation complete.");
        resolve(base64String);
      });
      doc.on("error", (error) => {
        console.error("Error during PDF generation:", error);
        reject(error);
      });
    });
  } catch (error) {
    console.error("Error generating PDF:", error);
    return null;
  }
}

export async function generateCombinedPDF(
  vaccineCode: string,
  patient: any,
  documentRefId: string,
  isRoutine: boolean
): Promise<string | null> {
  try {
    console.log("Starting PDF generation...");

    const vaccine = _vaccineCodes[vaccineCode];
    console.log("Vaccine code resolved:", vaccine);

    const doc = new PDFDocument({ margin: 50 });
    const IDs = await processIdentifiers(patient.identifier);
    const identificationType = "identification_type";

    let idType = null;
    let idNumber = null;
    if (IDs.length > 0) {
      for (let id of IDs) {
        // If the type matches the identificationType, break the loop
        if (id.type === identificationType) {
          console.log(`Match found: ${id.system} with value ${id.value}`);
          idType = id.system;
          idNumber = id.value;
          break;
        }
      }
    } else {
      console.log("No identifiers found.");
    }

    const names = `${patient?.name[0]?.family} ${patient?.name[0]?.given[0]}${
      patient?.name[0]?.given[1] ? " " + patient?.name[0]?.given[1] : ""
    }`;
    console.log("Patient name and ID details:", { names, idType, idNumber });

    // Prepare QR Code
    const qrCodeBuffer = await QRCode.toBuffer(
      `${QR_BASE_URL}/${documentRefId}/$validate`
    );
    console.log("Generated QR Code.");

    const qrCodeWidth = 100;
    const qrCodeHeight = 100;

    // Prepare Logo
    const logoWidth = 200;
    const logoHeight = 150;
    const logoPath = MOH_LOGO;
    console.log("Logo settings prepared.");

    // Pipe document to buffer array
    const buffers: Buffer[] = [];
    doc.on("data", buffers.push.bind(buffers));

    // Add logo
    doc.image(
      logoPath,
      doc.page.width / 2 - logoWidth / 2,
      doc.page.margins.top,
      { width: logoWidth, height: logoHeight }
    );
    doc.moveDown(12.5);
    console.log("Added logo to PDF.");

    // Add title text
    // Base certificate text
    const baseText = "VACCINATION CERTIFICATE";
    // Conditional text generation
    const text = isRoutine
      ? baseText.toUpperCase()
      : `${vaccine.toUpperCase()} ${baseText}`;
    doc.font("Helvetica-Bold").fontSize(16).text(text, { align: "center" });
    console.log("Added title text to PDF.");

    const vaccineText = isRoutine
      ? `the following:`
      : `${vaccine.split(" ")[0].toUpperCase()}`;

    // Add additional text
    const additionalText = `This is to certify that ${names}, born on ${new Date(
      patient.birthDate
    )
      .toLocaleDateString("en-GB")
      .replace(
        /\/+/g,
        "-"
      )}, from Kenya with ${idType}: ${idNumber}, has been vaccinated against ${vaccineText} on the date indicated in accordance with the National Health Regulations.`;
    doc
      .font("Helvetica")
      .fontSize(12)
      .text(additionalText, { align: "center", continued: false });
    console.log("Added additional text to PDF.");

    // Add table
    const tableData = [
      ["Vaccine Name", "No of doses", "Date Administered"],
      // Add more rows as needed
    ];
    console.log("Initialized table data.");
    let baseUrl = `/Immunization?patient=${patient.id}`;
    const fullUrl = `${baseUrl}${
      isRoutine ? "&_sort=date" : `&vaccine-code=${vaccineCode}`
    }`;

    const vaccineData = (
      await FhirApi({
        url: fullUrl,
        headers: { "Cache-Control": "no-cache" },
      })
    ).data;
    console.log("Fetched vaccine data from FHIR API:", vaccineData);

    if (!vaccineData?.entry) {
      console.log("No vaccine data found.");
      return null;
    }

    for (let vaccine of vaccineData?.entry) {
      // For Routine: Remember to exclude non-routine vaccines in the table list
      if (isRoutine) {
        const code=vaccine?.resource?.vaccineCode?.coding[0].code;
       
        //check if this code if part of the non routine: if so ignore it
        const nonRoutineCodes = Object.keys(_nonRoutineVaccinces);
        if (!nonRoutineCodes.includes(code)) {
            console.log('dealing with code **** '+code);
            tableData.push([
                vaccine?.resource?.vaccineCode?.text,
                vaccine?.resource?.doseQuantity?.value,
                new Date(vaccine?.resource?.occurrenceDateTime)
                  .toLocaleDateString("en-GB")
                  .replace(/\/+/g, "-"),
              ]);
        }

      } else {
        tableData.push([
          vaccine?.resource?.vaccineCode?.text,
          vaccine?.resource?.doseQuantity?.value,
          new Date(vaccine?.resource?.occurrenceDateTime)
            .toLocaleDateString("en-GB")
            .replace(/\/+/g, "-"),
        ]);
      }
    }
    console.log("Populated table data:", tableData);

    const columnWidths = [150, 150, 150];
    const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);
    let startX = doc.page.width / 2 - tableWidth / 2;
    let startY =
      doc.page.height - doc.page.margins.bottom - qrCodeHeight - (150 + 100);
    console.log("Calculated table positioning:", { startX, startY });

    const drawTable = (
      doc: PDFKit.PDFDocument,
      tableData: any[],
      startX: number,
      startY: number,
      columnWidths: number[]
    ) => {
      console.log("Drawing table...");
      doc.font("Helvetica-Bold").fontSize(10);

      // Draw headers
      tableData[0].forEach((header: any, i: any) => {
        doc.text(header, startX + columnWidths[i] * i, startY, {
          width: columnWidths[i],
          align: "left",
        });
      });

      startY += 20;

      // Draw rows
      tableData.slice(1).forEach((row) => {
        row.forEach((cell: any, i: any) => {
          doc.text(cell, startX + columnWidths[i] * i, startY, {
            width: columnWidths[i],
            align: "left",
          });
        });
        startY += 20;
      });
      console.log("Table drawn successfully.");
    };

    drawTable(doc, tableData, startX, startY, columnWidths);

    // Add QR Code
    doc.image(
      qrCodeBuffer,
      doc.page.width / 2 - qrCodeWidth / 2,
      doc.page.height - doc.page.margins.bottom - qrCodeHeight,
      { width: qrCodeWidth, height: qrCodeHeight }
    );
    console.log("Added QR code to PDF.");

    // Finalize PDF file
    doc.end();

    // Return PDF as base64 string
    console.log("Finalizing PDF...");
    return new Promise<string>((resolve, reject) => {
      doc.on("end", () => {
        const concatenatedBuffer = Buffer.concat(buffers);
        const base64String = concatenatedBuffer.toString("base64");
        console.log("PDF generation complete.");
        resolve(base64String);
      });
      doc.on("error", (error) => {
        console.error("Error during PDF generation:", error);
        reject(error);
      });
    });
  } catch (error) {
    console.error("Error generating PDF:", error);
    return null;
  }
}

export async function savePDFToFileSystem(
  base64String: string,
  filePath: string
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const buffer = Buffer.from(base64String, "base64");
    fs.writeFile(filePath, buffer, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}
