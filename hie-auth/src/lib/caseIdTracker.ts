import { prisma } from "./prisma";

export const generateCaseId = async (
  countryCode: string,
  countyCode: string,
  subCountyCode: string,
  conditionCode: string,
): Promise<number> => {
  const normalizedCountry = typeof countryCode === "string" ? countryCode.trim() : "";
  const normalizedCounty = typeof countyCode === "string" ? countyCode.trim() : "";
  const normalizedSubCounty = typeof subCountyCode === "string" ? subCountyCode.trim() : "";
  const normalizedCondition = typeof conditionCode === "string" ? conditionCode.trim() : "";

  if (
    !normalizedCountry ||
    !normalizedCounty ||
    !normalizedSubCounty ||
    !normalizedCondition
  ) {
    throw new Error(
      `Missing required codes for case id generation: { countryCode: ${JSON.stringify(normalizedCountry)}, countyCode: ${JSON.stringify(normalizedCounty)}, subCountyCode: ${JSON.stringify(normalizedSubCounty)}, conditionCode: ${JSON.stringify(normalizedCondition)} }`,
    );
  }

  /** Atomic bump: first allocation is 1, then increment (avoids concurrent double-read gaps). */
  const row = await prisma.$transaction((tx) =>
    tx.caseIdTracker.upsert({
      where: {
        countryCode_countyCode_subCountyCode_conditionCode: {
          countryCode: normalizedCountry,
          countyCode: normalizedCounty,
          subCountyCode: normalizedSubCounty,
          conditionCode: normalizedCondition,
        },
      },
      create: {
        countryCode: normalizedCountry,
        countyCode: normalizedCounty,
        subCountyCode: normalizedSubCounty,
        conditionCode: normalizedCondition,
        lastCaseId: 1,
      },
      update: {
        lastCaseId: { increment: 1 },
      },
    }),
  );

  return row.lastCaseId;
};
