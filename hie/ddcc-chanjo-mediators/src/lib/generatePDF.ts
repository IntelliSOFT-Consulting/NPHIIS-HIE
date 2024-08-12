import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import path from "path";
import fs from "fs";
import { processIdentifiers } from "./fhir";
import { FhirApi } from "./utils";
import { nonRoutineVaccince, vaccineCodes } from "./vaccineCodes";

let MOH_LOGO = path.join(__dirname, "MOH-Logo.png");
let FOOTER_LOGO = path.join(__dirname, "footer.png");
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


 
export async function generateCombinedPDFv1(
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
    const buffers: Buffer[] = [];
    doc.on("data", buffers.push.bind(buffers));

    const IDs = await processIdentifiers(patient.identifier);
    const identificationType = "identification_type";
    let idType = null;
    let idNumber = null;
    if (IDs.length > 0) {
      for (let id of IDs) {
        if (id.type === identificationType) {
          idType = id.system;
          idNumber = id.value;
          break;
        }
      }
    }

    const names = `${patient?.name[0]?.family} ${patient?.name[0]?.given[0]}${
      patient?.name[0]?.given[1] ? " " + patient?.name[0]?.given[1] : ""
    }`;

    const qrCodeBuffer = await QRCode.toBuffer(`${QR_BASE_URL}/${documentRefId}/$validate`);
    const qrCodeWidth = 100;
    const qrCodeHeight = 100;
    const logoWidth = 200;
    const logoHeight = 150;
    const logoPath = MOH_LOGO;

    const baseUrl = `/Immunization?patient=${patient.id}`;
    const fullUrl = `${baseUrl}${isRoutine ? "&_sort=date" : `&vaccine-code=${vaccineCode}`}`;
    const vaccineData = (await FhirApi({ url: fullUrl, headers: { "Cache-Control": "no-cache" } })).data;

    if (!vaccineData?.entry) {
      console.log("No vaccine data found.");
      return null;
    }

    // Prepare table data
    const tableData: any[] = [];
    const MAX_VACCINES = 10;
    const vaccines = vaccineData.entry;

    const paginateVaccines = (data: any[], pageSize: number) => {
      const pages = [];
      for (let i = 0; i < data.length; i += pageSize) {
        pages.push(data.slice(i, i + pageSize));
      }
      return pages;
    };

    const pages = paginateVaccines(vaccines, MAX_VACCINES);

    const drawTable = (
      doc: PDFKit.PDFDocument,
      tableData: any[],
      startX: number,
      startY: number,
      columnWidths: number[]
    ) => {
      doc.font("Helvetica-Bold").fontSize(10);
      const padding = 5; // Padding inside cells

      // Draw table headers
      tableData[0].forEach((header: any, i: any) => {
        doc.text(header, startX + columnWidths[i] * i + padding, startY + padding, {
          width: columnWidths[i] - 2 * padding,
          align: "left",
        });
      });

      // Draw table content
      let rowY = startY + 20; // Adjust starting Y position for content
      tableData.slice(1).forEach(row => {
        row.forEach((cell: any, colIndex: any) => {
          doc.text(cell, startX + columnWidths[colIndex] * colIndex + padding, rowY + padding, {
            width: columnWidths[colIndex] - 2 * padding,
            align: "left",
          });
        });
        rowY += 20;
      });

      // Remove table borders
    };

    const columnWidths = [150, 150, 150];
    const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);

    const vaccineText = isRoutine
      ? "the following:"
      : `${vaccine.split(" ")[0].toUpperCase()}`;

    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      if (pageIndex > 0) {
        doc.addPage();
      }

      // Add header only on the first page
      if (pageIndex === 0) {
        doc.image(logoPath, doc.page.width / 2 - logoWidth / 2, doc.page.margins.top, { width: logoWidth, height: logoHeight });
        doc.moveDown(12.5);

        const titleText = isRoutine
          ? "VACCINATION CERTIFICATE"
          : `${vaccine.toUpperCase()} VACCINATION CERTIFICATE`;
        doc.font("Helvetica-Bold").fontSize(16).text(titleText, { align: "center" });

        const additionalText = `This is to certify that ${names}, born on ${new Date(patient.birthDate).toLocaleDateString("en-GB").replace(/\/+/g, "-")}, from Kenya with ${idType}: ${idNumber}, has been vaccinated against ${vaccineText} on the date indicated in accordance with the National Health Regulations.`;
        doc.font("Helvetica").fontSize(12).text(additionalText, { align: "center" });

        doc.moveDown(2);
      }

      // Draw table for the current page
      const currentPageData = pages[pageIndex];
      const startX = doc.page.width / 2 - tableWidth / 2;
      const startY = pageIndex === 0 ? doc.y + 10 : doc.page.margins.top; // Adjust for the first page

      drawTable(doc, [["Vaccine Name", "No of doses", "Date Administered"], ...currentPageData.map((vaccine: any) => [
        vaccine?.resource?.vaccineCode?.text,
        vaccine?.resource?.doseQuantity?.value,
        new Date(vaccine?.resource?.occurrenceDateTime).toLocaleDateString("en-GB").replace(/\/+/g, "-"),
      ])], startX, startY, columnWidths);

      // Add QR Code and footer text only on the last page
      if (pageIndex === pages.length - 1) {
        const qrCodeX = doc.page.width / 2 - qrCodeWidth / 2;
        const qrCodeY = doc.page.height - doc.page.margins.bottom - qrCodeHeight - 70; // Add 70 units space from bottom for footer and date
        doc.image(qrCodeBuffer, qrCodeX, qrCodeY, { width: qrCodeWidth, height: qrCodeHeight });

        // Footer text
        const footerText = "This document is system generated and therefore does not require a signature. You may confirm this certificate by scanning the QR code.";
        doc.font("Helvetica").fontSize(10).text(footerText, doc.page.margins.left, doc.page.height - doc.page.margins.bottom - 60, {
          width: doc.page.width - 2 * doc.page.margins.left,
          align: "center",
        });

        // Format current date as "Jan 1, 2020"
        const dateFormatter = new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        const formattedDate = dateFormatter.format(new Date());

        // Add date generated text
      //   doc.font("Helvetica").fontSize(10).text(`Date Generated: ${formattedDate}`, doc.page.width / 2, doc.page.height - doc.page.margins.bottom - 30, { align: "center" });
      // }
      doc.font("Helvetica").fontSize(10).text(`Date Generated: ${formattedDate}`, doc.page.margins.left, doc.page.height - doc.page.margins.bottom - 20, { align: "center" });
    
      }}

    doc.end();

    return new Promise<string>((resolve, reject) => {
      doc.on("end", () => {
        const concatenatedBuffer = Buffer.concat(buffers);
        const base64String = concatenatedBuffer.toString("base64");
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

export async function generateCombinedPDFv9(
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
    const buffers: Buffer[] = [];
    doc.on("data", buffers.push.bind(buffers));

    const IDs = await processIdentifiers(patient.identifier);
    const identificationType = "identification_type";
    let idType = null;
    let idNumber = null;
    if (IDs.length > 0) {
      for (let id of IDs) {
        if (id.type === identificationType) {
          idType = id.system;
          idNumber = id.value;
          break;
        }
      }
    }

    const names = `${patient?.name[0]?.family} ${patient?.name[0]?.given[0]}${
      patient?.name[0]?.given[1] ? " " + patient?.name[0]?.given[1] : ""
    }`;

    const qrCodeBuffer = await QRCode.toBuffer(`${QR_BASE_URL}/${documentRefId}/$validate`);
    const qrCodeWidth = 100;
    const qrCodeHeight = 100;
    const logoWidth = 200;
    const logoHeight = 150;
    const logoPath = MOH_LOGO;

    const baseUrl = `/Immunization?patient=${patient.id}`;
    const fullUrl = `${baseUrl}${isRoutine ? "&_sort=date" : `&vaccine-code=${vaccineCode}`}`;
    const vaccineData = (await FhirApi({ url: fullUrl, headers: { "Cache-Control": "no-cache" } })).data;

    if (!vaccineData?.entry) {
      console.log("No vaccine data found.");
      return null;
    }

    // Prepare table data
    const tableData: any[] = [];
    const MAX_VACCINES = 10;
    const vaccines = vaccineData.entry;

    const paginateVaccines = (data: any[], pageSize: number) => {
      const pages = [];
      for (let i = 0; i < data.length; i += pageSize) {
        pages.push(data.slice(i, i + pageSize));
      }
      return pages;
    };

    const pages = paginateVaccines(vaccines, MAX_VACCINES);

    const drawTable = (
      doc: PDFKit.PDFDocument,
      tableData: any[],
      startX: number,
      startY: number,
      columnWidths: number[]
    ) => {
      doc.font("Helvetica-Bold").fontSize(10);
      const padding = 5; // Padding inside cells

      // Draw table headers
      tableData[0].forEach((header: any, i: any) => {
        doc.text(header, startX + columnWidths[i] * i + padding, startY + padding, {
          width: columnWidths[i] - 2 * padding,
          align: "left",
        });
      });

      // Draw table content
      let rowY = startY + 20; // Adjust starting Y position for content
      tableData.slice(1).forEach(row => {
        row.forEach((cell: any, colIndex: any) => {
          doc.text(cell, startX + columnWidths[colIndex] * colIndex + padding, rowY + padding, {
            width: columnWidths[colIndex] - 2 * padding,
            align: "left",
          });
        });
        rowY += 20;
      });
    };

    const columnWidths = [150, 150, 150];
    const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);

    const vaccineText = isRoutine
      ? "the following:"
      : `${vaccine.split(" ")[0].toUpperCase()}`;

    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      if (pageIndex > 0) {
        doc.addPage();
      }

      // Add header only on the first page
      if (pageIndex === 0) {
        doc.image(logoPath, doc.page.width / 2 - logoWidth / 2, doc.page.margins.top, { width: logoWidth, height: logoHeight });
        doc.moveDown(12.5);

        const titleText = isRoutine
          ? "VACCINATION CERTIFICATE"
          : `${vaccine.toUpperCase()} VACCINATION CERTIFICATE`;
        doc.font("Helvetica-Bold").fontSize(16).text(titleText, { align: "center" });

        const additionalText = `This is to certify that ${names}, born on ${new Date(patient.birthDate).toLocaleDateString("en-GB").replace(/\/+/g, "-")}, from Kenya with ${idType}: ${idNumber}, has been vaccinated against ${vaccineText} on the date indicated in accordance with the National Health Regulations.`;
        doc.font("Helvetica").fontSize(12).text(additionalText, { align: "center" });

        doc.moveDown(2);
      }

      // Draw table for the current page
      const currentPageData = pages[pageIndex];
      const startX = doc.page.width / 2 - tableWidth / 2;
      const startY = pageIndex === 0 ? doc.y + 10 : doc.page.margins.top + 10; // Adjust for the first page

      drawTable(doc, [["Vaccine Name", "No of doses", "Date Administered"], ...currentPageData.map((vaccine: any) => [
        vaccine?.resource?.vaccineCode?.text,
        vaccine?.resource?.doseQuantity?.value,
        new Date(vaccine?.resource?.occurrenceDateTime).toLocaleDateString("en-GB").replace(/\/+/g, "-"),
      ])], startX, startY, columnWidths);

      // Add QR Code and footer text only on the last page
      if (pageIndex === pages.length - 1) {
        const qrCodeX = doc.page.width / 2 - qrCodeWidth / 2;
        const qrCodeY = doc.page.height - doc.page.margins.bottom - qrCodeHeight - 200; // Increased space to account for additional text, date text, and footer logo
        doc.image(qrCodeBuffer, qrCodeX, qrCodeY, { width: qrCodeWidth, height: qrCodeHeight });

        // Add space before additional text
        const additionalTextY = qrCodeY + qrCodeHeight + 20; // Add 20 units of space below QR code
        const additionalText = "This document is system generated and therefore does not require a signature. You may confirm this certificate by scanning the QR code.";
        doc.font("Helvetica").fontSize(10).text(additionalText, doc.page.margins.left, additionalTextY, {
          width: doc.page.width - 2 * doc.page.margins.left,
          align: "center",
        });

        // Format current date as "Jan 1, 2020"
        const dateFormatter = new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        const formattedDate = dateFormatter.format(new Date());

        // Add date generated text below additional text
        const dateGeneratedY = additionalTextY + 40; // Increased space to ensure readability of date text
        doc.font("Helvetica").fontSize(10).text(`Date Generated: ${formattedDate}`, doc.page.margins.left, dateGeneratedY, { align: "center" });

        // Add space for additional image
        doc.moveDown(3); // Add some extra space for the new image

        // Example additional image
        const additionalImagePath = FOOTER_LOGO; // Replace with your image path
        const additionalImageWidth = 150; // Adjust size as needed
        const additionalImageHeight = 40; // Adjust size as needed
        const additionalImageX = doc.page.width / 2 - additionalImageWidth / 2;
        const additionalImageY = doc.page.height - doc.page.margins.bottom - additionalImageHeight - 10; // Adjust positioning
        doc.image(additionalImagePath, additionalImageX, additionalImageY, { width: additionalImageWidth, height: additionalImageHeight });
      }
    }

    doc.end();

    return new Promise<string>((resolve, reject) => {
      doc.on("end", () => {
        const concatenatedBuffer = Buffer.concat(buffers);
        const base64String = concatenatedBuffer.toString("base64");
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
    const buffers: Buffer[] = [];
    doc.on("data", buffers.push.bind(buffers));

    const IDs = await processIdentifiers(patient.identifier);
    const identificationType = "identification_type";
    let idType = null;
    let idNumber = null;
    if (IDs.length > 0) {
      for (let id of IDs) {
        if (id.type === identificationType) {
          idType = id.system;
          idNumber = id.value;
          break;
        }
      }
    }

    const names = `${patient?.name[0]?.family} ${patient?.name[0]?.given[0]}${
      patient?.name[0]?.given[1] ? " " + patient?.name[0]?.given[1] : ""
    }`;

    const qrCodeBuffer = await QRCode.toBuffer(`${QR_BASE_URL}/${documentRefId}/$validate`);
    const qrCodeWidth = 100;
    const qrCodeHeight = 100;
    const logoWidth = 200;
    const logoHeight = 150;
    const logoPath = MOH_LOGO;

    const baseUrl = `/Immunization?patient=${patient.id}`;
    const fullUrl = `${baseUrl}${isRoutine ? "&_sort=date" : `&vaccine-code=${vaccineCode}`}`;
    const vaccineData = (await FhirApi({ url: fullUrl, headers: { "Cache-Control": "no-cache" } })).data;

    if (!vaccineData?.entry) {
      console.log("No vaccine data found.");
      return null;
    }

    // Prepare table data
    const tableData: any[] = [];
    const MAX_VACCINES = 10;
    const vaccines = vaccineData.entry;

    const paginateVaccines = (data: any[], pageSize: number) => {
      const pages = [];
      for (let i = 0; i < data.length; i += pageSize) {
        pages.push(data.slice(i, i + pageSize));
      }
      return pages;
    };

    const pages = paginateVaccines(vaccines, MAX_VACCINES);

    const drawTable = (
      doc: PDFKit.PDFDocument,
      tableData: any[],
      startX: number,
      startY: number,
      columnWidths: number[]
    ) => {
      doc.font("Helvetica-Bold").fontSize(10);
      const padding = 5; // Padding inside cells

      // Draw table headers
      tableData[0].forEach((header: any, i: any) => {
        doc.text(header, startX + columnWidths[i] * i + padding, startY + padding, {
          width: columnWidths[i] - 2 * padding,
          align: "left",
        });
      });

      // Draw table content
      let rowY = startY + 20; // Adjust starting Y position for content
      tableData.slice(1).forEach(row => {
        row.forEach((cell: any, colIndex: any) => {
          doc.text(cell, startX + columnWidths[colIndex] * colIndex + padding, rowY + padding, {
            width: columnWidths[colIndex] - 2 * padding,
            align: "left",
          });
        });
        rowY += 20;
      });
    };

    const columnWidths = [150, 150, 150];
    const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);

    const vaccineText = isRoutine
      ? "the following:"
      : `${vaccine.split(" ")[0].toUpperCase()}`;

    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      if (pageIndex > 0) {
        doc.addPage();
      }

      // Add header only on the first page
      if (pageIndex === 0) {
        doc.image(logoPath, doc.page.width / 2 - logoWidth / 2, doc.page.margins.top, { width: logoWidth, height: logoHeight });
        doc.moveDown(12.5);

        const titleText = isRoutine
          ? "VACCINATION CERTIFICATE"
          : `${vaccine.toUpperCase()} VACCINATION CERTIFICATE`;
        doc.font("Helvetica-Bold").fontSize(16).text(titleText, { align: "center" });

        const additionalText = `This is to certify that ${names}, born on ${new Date(patient.birthDate).toLocaleDateString("en-GB").replace(/\/+/g, "-")}, from Kenya with ${idType}: ${idNumber}, has been vaccinated against ${vaccineText} on the date indicated in accordance with the National Health Regulations.`;
        doc.font("Helvetica").fontSize(12).text(additionalText, { align: "center" });

        doc.moveDown(2);
      }

      // Add client name at the top of the table for subsequent pages
      if (pageIndex > 0) {
        const clientNameText = `${names}`;
        doc.font("Helvetica-Bold").fontSize(12).text(clientNameText, doc.page.margins.left, doc.page.margins.top + 10, {
          width: doc.page.width - 2 * doc.page.margins.left,
          align: "center",
        });
        doc.moveDown(1); // Adjust space below the client name
      }

      // Draw table for the current page
      const currentPageData = pages[pageIndex];
      const startX = doc.page.width / 2 - tableWidth / 2;
      const startY = pageIndex === 0 ? doc.y + 10 : doc.y + 30; // Adjust Y position for the first page

      drawTable(doc, [["Vaccine Name", "No of doses", "Date Administered"], ...currentPageData.map((vaccine: any) => [
        vaccine?.resource?.vaccineCode?.text,
        vaccine?.resource?.doseQuantity?.value,
        new Date(vaccine?.resource?.occurrenceDateTime).toLocaleDateString("en-GB").replace(/\/+/g, "-"),
      ])], startX, startY, columnWidths);

      // Add QR Code and footer text only on the last page
      if (pageIndex === pages.length - 1) {
        const qrCodeX = doc.page.width / 2 - qrCodeWidth / 2;
        const qrCodeY = doc.page.height - doc.page.margins.bottom - qrCodeHeight - 200; // Increased space to account for additional text and footer image
        doc.image(qrCodeBuffer, qrCodeX, qrCodeY, { width: qrCodeWidth, height: qrCodeHeight });

        // Add space before additional text
        const additionalTextY = qrCodeY + qrCodeHeight + 20; // Add 20 units of space below QR code
        const additionalText = "This document is system generated and therefore does not require a signature. You may confirm this certificate by scanning the QR code.";
        doc.font("Helvetica").fontSize(10).text(additionalText, doc.page.margins.left, additionalTextY, {
          width: doc.page.width - 2 * doc.page.margins.left,
          align: "center",
        });

        // Format current date as "Jan 1, 2020"
        const dateFormatter = new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        const formattedDate = dateFormatter.format(new Date());

        // Add date generated text below additional text
        const dateGeneratedY = additionalTextY + 40; // Increased space to ensure readability of date text
        doc.font("Helvetica").fontSize(10).text(`Date Generated: ${formattedDate}`, doc.page.margins.left, dateGeneratedY, { align: "center" });

        // Add space for additional image
        const additionalImagePath = FOOTER_LOGO; // Replace with your image path
        const additionalImageWidth = 150; // Adjust size as needed
        const additionalImageHeight = 40; // Adjust size as needed
        const additionalImageX = doc.page.width / 2 - additionalImageWidth / 2;
        const additionalImageY = doc.page.height - doc.page.margins.bottom - additionalImageHeight - 10; // Adjust positioning
        doc.image(additionalImagePath, additionalImageX, additionalImageY, { width: additionalImageWidth, height: additionalImageHeight });
      }
    }

    doc.end();

    return new Promise<string>((resolve, reject) => {
      doc.on("end", () => {
        resolve(Buffer.concat(buffers).toString("base64"));
      });
      doc.on("error", (err) => {
        reject(err);
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