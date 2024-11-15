import { PrismaClient } from "@prisma/client";
import { differenceInDays } from "date-fns";
import { getLocationHierarchy, getLocationName, getPatientIdentifier, locationId } from "../utils/helpers";

const prisma = new PrismaClient();

const clearData = async () => {
  const tableExists =
    await prisma.$queryRaw`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'primary_immunization_dataset')`;
  if (tableExists[0].exists) {
    await prisma.primaryImmunizationDataset.deleteMany();
    console.log("Data cleared successfully");
  }
};

export const importData = async (data) => {
  try {
    await clearData();
    const { patients, locations, immunizations, recommendations } = data;

    const allImmunizations = [];

    for (const patient of patients) {
      const patientRecommendation = recommendations.find((recommendation) => recommendation.patient.patientId === patient.id);

      const patientImmunizations = immunizations.filter((immunization) => immunization.patient.patientId === patient.id);

      if (!patientRecommendation) continue;

      const phone = patient.telecom.find((contact) => contact.system === "phone")?.value;
      const contactWithPhone = patient.contact.find((contact) => contact.telecom.find((c) => c.value));
      const contactRelationship = contactWithPhone?.relationship?.[0]?.text;
      const contactGivenName = contactWithPhone?.name?.given?.join(" ") || "";
      const contactFamilyName = contactWithPhone?.name?.family || "";
      const contactName = `${contactGivenName} ${contactFamilyName}`;
      const phonePrimary = phone ? phone : `${contactWithPhone?.telecom.find((c) => c.system === "phone")?.value} (${contactRelationship})`;

      const tag = patient.meta?.tag?.find((tag) => tag.code);

      const patientLocation = getLocationHierarchy(locationId(tag?.code?.toString()), locations);

      const facilityName = tag?.display;
      const facilityCode = locationId(tag?.code);

      const identity = getPatientIdentifier(patient);

      const patientData = {
        patientId: patient.id,
        familyName: patient.name[0].family,
        givenName: patient.name[0].given?.join(" "),
        birthDate: new Date(patient.birthDate),
        gender: patient.gender,
        isActive: patient.active,
        documentType: identity.identifier,
        documentId: identity.idNumber?.toString(),
        isDeceased: patient.deceased ? patient.deceased?.boolean : false,
        isMultipleBirth: patient.multipleBirth?.boolean || false,
        phonePrimary: phonePrimary,
        phoneSecondary: null,
        guardianRelationship: contactRelationship,
        guardianName: contactName,
        guardianPhone: phonePrimary,
        facilityName: facilityName,
        facilityCode: facilityCode?.toString(),
        ward: patientLocation.ward,
        wardCode: patientLocation.ward_id?.toString(),
        subcounty: patientLocation.subcounty,
        subcountyCode: patientLocation.subcounty_id?.toString(),
        county: patientLocation.county,
        countyCode: patientLocation.county_id?.toString(),
        village: patient.address?.[0]?.line[patient.address?.[0]?.line?.length - 1],
        patientLastUpdated: new Date(patient.meta?.lastUpdated),
        dataSource: "Hive",
      };

      const formattedRecommendations = patientRecommendation.recommendation.map((item) => {
        const dueDate = item.dateCriterion.find((criterion) => criterion.code.coding[0].code === "Earliest-date-to-administer")?.value;
        const ageDifferenceInYears = differenceInDays(new Date(), new Date(patient.birthDate)) / 365.25;
        const ageDifferenceInMonths = differenceInDays(new Date(), new Date(patient.birthDate)) / 30.44;
        const vaccinationData = {
          isDefaulter: differenceInDays(new Date(), new Date(dueDate)) > 0,
          defaulterDays: 0,
          immunizationStatus: "Not Administered",
          batchNumber: null,
          administrationLocation: null,
          daysFromDueDate: differenceInDays(new Date(), new Date(dueDate)),
          administeredDate: null,
          recordUpdatedAt: new Date(patientRecommendation?.date),
          defaulterDays: differenceInDays(new Date(), new Date(dueDate)),
          ageYears: Math.round(ageDifferenceInYears * 10) / 10,
          ageMonths: Math.round(ageDifferenceInMonths * 10) / 10,
          ageGroup: ageDifferenceInYears < 1 ? "Below 1 year" : "Above 1 year",
        };
        const immunization = patientImmunizations.find(
          (immunization) => immunization.vaccineCode.coding[0].display === item.vaccineCode[0].coding[0].display
        );

        if (immunization) {
          const immunizationAgeDifferenceInYears = differenceInDays(new Date(immunization.recorded), new Date(patient.birthDate)) / 365.25;
          const immunizationAgeDifferenceInMonths = differenceInDays(new Date(immunization.recorded), new Date(patient.birthDate)) / 30.44;
          vaccinationData.immunizationStatus = immunization.status;
          vaccinationData.batchNumber = immunization.lotNumber?.toString();
          vaccinationData.administrationLocation = immunization.note?.[0]?.text || "Facility";
          vaccinationData.daysFromDueDate = differenceInDays(new Date(immunization.recorded), new Date(dueDate));
          vaccinationData.administeredDate = new Date(immunization.recorded);
          vaccinationData.defaulterDays = differenceInDays(new Date(), new Date(dueDate));
          vaccinationData.isDefaulter = differenceInDays(new Date(), new Date(dueDate)) > 0;
          vaccinationData.recordUpdatedAt = new Date(immunization.occurrence?.dateTime) || new Date(immunization.occurrenceDatetime);
          vaccinationData.ageYears = Math.round(immunizationAgeDifferenceInYears * 10) / 10;
          vaccinationData.ageMonths = Math.round(immunizationAgeDifferenceInMonths * 10) / 10;
          vaccinationData.ageGroup = immunizationAgeDifferenceInYears < 1 ? "Below 1 year" : "Above 1 year";
        }
        return {
          ...patientData,
          vaccineCode: item.vaccineCode[0].coding[0].display,
          vaccineName: item.vaccineCode[0].text,
          scheduleDueDate: new Date(dueDate),
          vaccineCategory: item.description,
          doseNumber: item.doseNumber?.positiveInt,
          seriesName: item.series?.toString(),
          targetDisease: item.targetDisease.text,
          diseaseCategory: item.targetDisease.text,
          recordCreatedAt: new Date(patientRecommendation.date),
          ...vaccinationData,
        };
      });

      allImmunizations.push(...formattedRecommendations);
    }

    const flattenedImmunizations = allImmunizations.flat();

    await importDataInBatches(flattenedImmunizations);
  } catch (error) {
    console.error("Error importing data:", error);
    throw error;
  }
};

// write a function to insert data into the database in batches of 1000
// this will prevent the server from crashing when importing large datasets
const importDataInBatches = async (data) => {
  const batchSize = 500;
  const dataLength = data.length;
  const batches = Math.ceil(dataLength / batchSize);
  let totalImported = 0;

  for (let i = 0; i < batches; i++) {
    console.log(`Importing batch ${i + 1} of ${batches}`);
    const start = i * batchSize;
    const end = start + batchSize;
    const batch = data.slice(start, end);

    await prisma.primaryImmunizationDataset.createMany({
      data: batch,
    });

    totalImported += batch.length;
    console.log(`imported ${totalImported} of ${dataLength}`);
  }

  console.log("Data imported successfully");
};
