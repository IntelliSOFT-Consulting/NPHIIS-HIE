import { PrismaClient } from "@prisma/client";
import { locationPriority } from "../utils/helpers";
import { startOfMonth, format, getMonth } from "date-fns";
import { groupVaccinesByAntigen, moh525Mapping } from "../utils/mapping";

const prisma = new PrismaClient();

export const Moh710Report = async (req, res) => {
  try {
    const defaultStartDate = startOfMonth(new Date());
    const { facility, county, subcounty, ward, start_date = new Date(defaultStartDate), end_date = new Date() } = req.query;

    const passedLocation = locationPriority(req.query);

    let query = {
      where: {
        vaccineCategory: "routine",
        immunizationStatus: "completed",
        recordUpdatedAt: {
          gte: new Date(start_date),
          lte: new Date(end_date),
        },
      },
    };

    if (passedLocation) {
      query.where = {
        ...passedLocation,
        ...query.where,
      };
    }

    const data = await prisma.primaryImmunizationDataset.findMany(query);

    const processedData = groupVaccinesByAntigen(data, start_date, end_date);

    const totalFacilityCount = data.filter((item) => item.administrationLocation === "Facility").length;
    const totalOutreachCount = data.filter((item) => item.administrationLocation === "Outreach").length;
    const total = data.length;
    const startDate = format(new Date(start_date), "yyyy-MM-dd");
    const endDate = format(new Date(end_date), "yyyy-MM-dd");

    const results = {
      data: processedData,
      metadata: {
        totalFacilityCount,
        totalOutreachCount,
        total,
        startDate,
        endDate,
        country: "Kenya",
        county,
        subcounty,
        ward,
        facility,
      },
    };

    res.status(200).json(results);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error fetching MOH 711 report data" });
  }
};

export const moh525Report = async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const passedLocation = locationPriority(req.query);

    let query = {
      where: {
        recordCreatedAt: {
          gte: new Date(start_date),
          lte: new Date(end_date),
        },
        isDefaulter: true,
      },
    };

    if (passedLocation) {
      query.where = {
        ...passedLocation,
        ...query.where,
      };
    }

    const data = await prisma.primaryImmunizationDataset.findMany(query);

    const processedData = moh525Mapping(data);

    res.status(200).send(processedData);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error fetching MOH 525 report data" });
  }
};

const calculateDropoutRate = (value1, value2) => {
  if (value1 === 0) return 0;
  const dropout = value1 - value2;
  return (dropout / value1) * 100;
};

export const monitoringReport = async (req, res) => {
  try {
    const { year = new Date().getFullYear(), county, subcounty, facility } = req.query;
    const vaccines = ["IMDPT-1", "IMDPT-3", "IMMEAS-0"];
    const vaccineNames = {
      "IMDPT-1": "DPT-HepB+Hib 1",
      "IMDPT-3": "DPT-HepB+Hib 3",
      "IMMEAS-0": "Measles-Rubella 1",
    };

    const filters = {
      vaccineCode: { in: vaccines },
      immunizationStatus: "completed",
      isActive: true,
      isDeceased: false,
      administeredDate: {
        gte: new Date(`${year}-01-01`),
        lte: new Date(`${year}-12-31`),
      },
    };
    if (county) filters.county = { contains: county, mode: "insensitive" };
    else if (subcounty) filters.subcounty = { contains: subcounty, mode: "insensitive" };
    else if (facility) filters.facilityCode = facility;

    const results = await prisma.primaryImmunizationDataset.groupBy({
      by: ["vaccineCode", "vaccineName", "administeredDate"],
      _count: { _all: true },
      where: filters,
    });

    const monthlyData = Array.from({ length: 12 }, () => Object.fromEntries(vaccines.map((vaccine) => [vaccine, 0])));
    results.forEach((row) => {
      const month = getMonth(row.administeredDate) + 1;
      monthlyData[month - 1][row.vaccineCode] += row._count._all;
    });

    const finalResults = [];
    const cumulativeData = Object.fromEntries(vaccines.map((vaccine) => [vaccine, 0]));

    for (let month = 0; month < 12; month++) {
      const monthData = {
        month: format(new Date(year, month), "MMMM"),
        year,
      };

      vaccines.forEach((vaccine) => {
        const monthlyCount = monthlyData[month][vaccine];
        cumulativeData[vaccine] += monthlyCount;
        monthData[`${vaccineNames[vaccine]}_monthly`] = monthlyCount;
        monthData[`${vaccineNames[vaccine]}_cumulative`] = cumulativeData[vaccine];
      });

      const dpt1Monthly = monthlyData[month]["IMDPT-1"] || 0;
      const dpt3Monthly = monthlyData[month]["IMDPT-3"] || 0;
      const measlesMonthly = monthlyData[month]["IMMEAS-0"] || 0;

      Object.assign(monthData, {
        DPT_dropout_monthly: dpt1Monthly - dpt3Monthly,
        DPT_dropout_rate_monthly: calculateDropoutRate(dpt1Monthly, dpt3Monthly).toFixed(2),
        Measles_dropout_monthly: dpt1Monthly - measlesMonthly,
        Measles_dropout_rate_monthly: calculateDropoutRate(dpt1Monthly, measlesMonthly).toFixed(2),
      });

      const dpt1Cumulative = cumulativeData["IMDPT-1"] || 0;
      const dpt3Cumulative = cumulativeData["IMDPT-3"] || 0;
      const measlesCumulative = cumulativeData["IMMEAS-0"] || 0;

      Object.assign(monthData, {
        DPT_dropout_cumulative: dpt1Cumulative - dpt3Cumulative,
        DPT_dropout_rate_cumulative: calculateDropoutRate(dpt1Cumulative, dpt3Cumulative).toFixed(2),
        Measles_dropout_cumulative: dpt1Cumulative - measlesCumulative,
        Measles_dropout_rate_cumulative: calculateDropoutRate(dpt1Cumulative, measlesCumulative).toFixed(2),
        DPT_performance_status: monthData.DPT_dropout_rate_cumulative < 10 ? "Good" : "Poor",
        Measles_performance_status: monthData.Measles_dropout_rate_cumulative < 10 ? "Good" : "Poor",
      });

      finalResults.push(monthData);
    }

    res.status(200).json({
      metadata: {
        report_year: year,
        county,
        subcounty,
        facility,
        generated_at: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
      },
      data: finalResults,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error fetching monitoring report data" });
  } finally {
    await prisma.$disconnect();
  }
};

export const defaulters = async (req, res) => {
  try {
    const { start_date, end_date, page_size = 20, page = 1, name, vaccine_name } = req.query;
    const passedLocation = locationPriority(req.query);

    const queryConditions = {
      isDefaulter: true,
      immunizationStatus: { not: "completed" },
      isDeceased: false,
      vaccineCategory: "routine",
    };

    if (start_date && end_date) {
      queryConditions.recordCreatedAt = {
        gte: new Date(start_date),
        lte: new Date(end_date),
      };
    }

    if (passedLocation) {
      Object.assign(queryConditions, passedLocation);
    }

    if (name) {
      queryConditions.OR = [
        { givenName: { contains: name, mode: "insensitive" } },
        { familyName: { contains: name, mode: "insensitive" } },
        { documentId: { contains: name, mode: "insensitive" } },
      ];
    }

    if (vaccine_name) {
      queryConditions.vaccineName = { contains: vaccine_name, mode: "insensitive" };
    }

    const query = {
      where: queryConditions,
      select: {
        patientId: true,
        documentId: true,
        documentType: true,
        familyName: true,
        givenName: true,
        birthDate: true,
        gender: true,
        phonePrimary: true,
        guardianRelationship: true,
        guardianName: true,
        guardianPhone: true,
        village: true,
        vaccineName: true,
        doseNumber: true,
        scheduleDueDate: true,
        defaulterDays: true,
        targetDisease: true,
      },
      take: parseInt(page_size, 10),
      skip: (parseInt(page, 10) - 1) * parseInt(page_size, 10),
    };

    const [total, data] = await Promise.all([
      prisma.primaryImmunizationDataset.count({ where: queryConditions }),
      prisma.primaryImmunizationDataset.findMany(query),
    ]);

    const totalPages = Math.ceil(total / page_size);
    res.status(200).json({
      data,
      per_page: page_size,
      total_records: total,
      current_page: page,
      total_pages: totalPages,
      generated_at: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching defaulters report data" });
  }
};
