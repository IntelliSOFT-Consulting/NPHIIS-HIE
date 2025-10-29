import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const generateCaseId = async (countryCode: string, countyCode: string, subCountyCode: string, conditionCode: string) => {
    const normalizedCountry = typeof countryCode === "string" ? countryCode.trim() : "";
    const normalizedCounty = typeof countyCode === "string" ? countyCode.trim() : "";
    const normalizedSubCounty = typeof subCountyCode === "string" ? subCountyCode.trim() : "";
    const normalizedCondition = typeof conditionCode === "string" ? conditionCode.trim() : "";

    // With countyCode included in the unique key, all four fields are required
    if (!normalizedCountry || !normalizedCounty || !normalizedSubCounty || !normalizedCondition) {
        throw new Error(`Missing required codes for case id generation: { countryCode: ${JSON.stringify(normalizedCountry)}, countyCode: ${JSON.stringify(normalizedCounty)}, subCountyCode: ${JSON.stringify(normalizedSubCounty)}, conditionCode: ${JSON.stringify(normalizedCondition)} }`);
    }

    // Check if a record exists for this country, county, subcounty, and condition combination
    const caseIdTracker = await prisma.caseIdTracker.findUnique({
        where: { 
            countryCode_countyCode_subCountyCode_conditionCode: {
                countryCode: normalizedCountry,
                countyCode: normalizedCounty,
                subCountyCode: normalizedSubCounty,
                conditionCode: normalizedCondition
            }
        }
    });

    if (!caseIdTracker) {
        // If no record exists, create a new one with lastCaseId = 1
        await prisma.caseIdTracker.create({
            data: {
                countryCode: normalizedCountry,
                countyCode: normalizedCounty,
                subCountyCode: normalizedSubCounty,
                conditionCode: normalizedCondition,
                lastCaseId: 1
            }
        });
        return 1;
    }

    // If record exists, increment the lastCaseId and update the database
    const newCaseId = caseIdTracker.lastCaseId + 1;
    
    await prisma.caseIdTracker.update({
        where: {
            countryCode_countyCode_subCountyCode_conditionCode: {
                countryCode: normalizedCountry,
                countyCode: normalizedCounty,
                subCountyCode: normalizedSubCounty,
                conditionCode: normalizedCondition
            }
        },
        data: {
            lastCaseId: newCaseId
        }
    });

    return newCaseId;
};