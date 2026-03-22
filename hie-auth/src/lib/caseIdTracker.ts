import { prisma } from "./prisma";

export const generateCaseId = async (countryCode: string, countyCode: string, subCountyCode: string, conditionCode: string) => {
    const normalizedCountry = typeof countryCode === "string" ? countryCode.trim() : "";
    const normalizedCounty = typeof countyCode === "string" ? countyCode.trim() : "";
    const normalizedSubCounty = typeof subCountyCode === "string" ? subCountyCode.trim() : "";
    const normalizedCondition = typeof conditionCode === "string" ? conditionCode.trim() : "";

    if (!normalizedCountry || !normalizedCounty || !normalizedSubCounty || !normalizedCondition) {
        throw new Error(`Missing required codes for case id generation: { countryCode: ${JSON.stringify(normalizedCountry)}, countyCode: ${JSON.stringify(normalizedCounty)}, subCountyCode: ${JSON.stringify(normalizedSubCounty)}, conditionCode: ${JSON.stringify(normalizedCondition)} }`);
    }

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
