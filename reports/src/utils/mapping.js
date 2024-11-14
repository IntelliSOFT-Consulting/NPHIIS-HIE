import { format } from "date-fns";
export const moh710SectionAMapping = {
  "IMBCG-I": {
    moh710Name: "BCG",
    vaccineCode: "IMBCG-I",
    nhddCode: "10517",
  },

  "IMPO-bOPV": {
    moh710Name: "OPV Birth Dose",
    vaccineCode: "IMPO-bOPV",
    nhddCode: "54379",
  },

  "IMPO-OPV-I": {
    moh710Name: "OPV1",
    vaccineCode: "IMPO-OPV-I",
    nhddCode: "54377",
  },
  "IMPO-OPV-II": {
    moh710Name: "OPV2",
    vaccineCode: "IMPO-OPV-II",
    nhddCode: "54377",
  },
  "IMPO-OPV-III": {
    moh710Name: "OPV3",
    vaccineCode: "IMPO-OPV-III",
    nhddCode: "54377",
  },

  "IMPO-IPV I": {
    moh710Name: "IPV",
    vaccineCode: "IMPO-IPV I",
    nhddCode: "3549",
  },

  "IMDPT-1": {
    moh710Name: "DPT-HepB-Hib 1",
    vaccineCode: "IMDPT-1",
    nhddCode: "14676",
  },
  "IMDPT-2": {
    moh710Name: "DPT-HepB-Hib 2",
    vaccineCode: "IMDPT-2",
    nhddCode: "14676",
  },
  "IMDPT-3": {
    moh710Name: "DPT-HepB-Hib 3",
    vaccineCode: "IMDPT-3",
    nhddCode: "50732",
  },

  "IMPCV10-1": {
    moh710Name: "PCV10 1",
    vaccineCode: "IMPCV10-1",
    nhddCode: "3573",
  },
  "IMPCV10-2": {
    moh710Name: "PCV10 2",
    vaccineCode: "IMPCV10-2",
    nhddCode: "3573",
  },
  "IMPCV10-3": {
    moh710Name: "PCV10 3",
    vaccineCode: "IMPCV10-3",
    nhddCode: "3573",
  },

  "IMROTA-1": {
    moh710Name: "Rota 1",
    vaccineCode: "IMROTA-1",
    nhddCode: "2763",
  },
  "IMROTA-2": {
    moh710Name: "Rota 2",
    vaccineCode: "IMROTA-2",
    nhddCode: "2763",
  },
  "IMROTA-3": {
    moh710Name: "Rota 3",
    vaccineCode: "IMROTA-3",
    nhddCode: "2763",
  },

  "IMVIT-1": {
    moh710Name: "Vitamin A",
    vaccineCode: "IMVIT-1",
    nhddCode: "1107",
  },

  "IMMEAS-0": {
    moh710Name: "Measles-Rubella 1",
    vaccineCode: "IMMEAS-0",
    nhddCode: "24014",
  },
  "IMMEAS-1": {
    moh710Name: "Measles-Rubella 2",
    vaccineCode: "IMMEAS-1",
    nhddCode: "24014",
  },

  "IMYF-I": {
    moh710Name: "Yellow Fever",
    vaccineCode: "IMYF-I",
    nhddCode: "1002",
  },
};

export const getVaccineMOH710Name = (vaccineCode) => {
  return moh710SectionAMapping[vaccineCode]?.moh710Name || vaccineCode;
};

export const isVaccineInSectionA = (vaccineCode) => {
  return !!moh710SectionAMapping[vaccineCode];
};

export const moh710SectionAOrder = [
  "IMBCG-I",
  "IMPO-bOPV",
  "IMPO-OPV-I",
  "IMPO-OPV-II",
  "IMPO-OPV-III",
  "IMPO-IPV I",
  "IMDPT-1",
  "IMDPT-2",
  "IMDPT-3",
  "IMPCV10-1",
  "IMPCV10-2",
  "IMPCV10-3",
  "IMROTA-1",
  "IMROTA-2",
  "IMROTA-3",
  "IMVIT-1",
  "IMMEAS-0",
  "IMMEAS-1",
  "IMYF-I",
];

export const generateDateRange = (start, end) => {
  const dateRange = [];
  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    dateRange.push(format(date, "yyyy-MM-dd"));
  }
  return dateRange;
};

const initializeData = (ageGroup, antigen, dateRange) => {
  return {
    ageGroup,
    antigen,
    facility_count: 0,
    outreach_count: 0,
    total: 0,
    ...dateRange.reduce((acc, date) => {
      acc[date] = { facility_count: 0, outreach_count: 0, total: 0 };
      return acc;
    }, {}),
  };
};

const updateData = (data, item, dateKey) => {
  const facilityImmunizations = item.administrationLocation === "Facility";
  const outreachImmunizations = item.administrationLocation === "Outreach";

  if (facilityImmunizations) {
    if (data[dateKey]) {
      data[dateKey].facility_count++;
      data[dateKey].total++;
    } else {
      data[dateKey] = { facility_count: 1, outreach_count: 0, total: 1 };
    }
    data.facility_count++;
    data.total++;
  } else if (outreachImmunizations) {
    if (data[dateKey]) {
      data[dateKey].outreach_count++;
      data[dateKey].total++;
    } else {
      data[dateKey] = { facility_count: 0, outreach_count: 1, total: 1 };
    }
    data.outreach_count++;
    data.total++;
  }
};

export const groupVaccinesByAntigen = (data, start, end) => {
  const report = moh710SectionAOrder
    .map((vaccineCode) => {
      const dateRange = generateDateRange(start, end);
      const antigen = moh710SectionAMapping[vaccineCode].moh710Name;

      const below1yearData = initializeData("Below 1 year", antigen, dateRange);
      const above1yearData = initializeData("Above 1 year", antigen, dateRange);
      const vaccineData = data.filter((item) => item.vaccineCode === vaccineCode);

      vaccineData.forEach((item) => {
        const dateKey = format(item.recordUpdatedAt, "yyyy-MM-dd");
        if (item.ageGroup === "Below 1 year") {
          updateData(below1yearData, item, dateKey);
        } else if (item.ageGroup === "Above 1 year") {
          updateData(above1yearData, item, dateKey);
        }
      });

      return [below1yearData, above1yearData];
    })
    .flat();

  return report;
};

export const moh525Mapping = (data) => {

  return data.map((item) => {
    let outcome = "";
    if (item.administrationLocation === "Facility") {
      outcome = "Traced & vaccinated at the facility";
    } else if (item.administrationLocation === "Outreach") {
      outcome = "Vaccinated at another facility/outreach";
    } else if (item.immunizationStatus === "Not Administered") {
      outcome = "Lost to follow up";
    } else {
      outcome = "Vaccinated at the facility & NOT documented";
    }
    return {
      "Age in Months of the Child": item.ageMonths,
      "Child's No": item.patientId,
      Date: item.scheduleDueDate,
      "Name of Parent/Caregiver": item.caregiverName,
      "Name of Village/Estate/Landmark": item.village,
      "Name of the Child": item.patientName,
      Outcome: outcome,
      Remarks: `Overdue by ${item.defaulterDays} days`,
      "Serial No (MOH510)": item.serial,
      "Sex (F/M)": item.gender,
      "Telephone No.": item.phoneNumber || "No contact provided",
      "Traced (YES/NO)": item.immunization_status === "completed" ? "Yes" : "No",
      "Vaccines Missed": moh710SectionAMapping[item.vaccineCode]?.moh710Name || item.vaccineName,
    };
  });
};
