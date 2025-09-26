import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const generateCaseId = async (countryCode: string, subCountyCode: string) => {
    // Check if a record exists for this country and subcounty combination
    const caseIdTracker = await prisma.caseIdTracker.findUnique({
        where: { 
            countryCode_subCountyCode: {
                countryCode,
                subCountyCode
            }
        }
    });

    if (!caseIdTracker) {
        // If no record exists, create a new one with lastCaseId = 1
        await prisma.caseIdTracker.create({
            data: {
                countryCode,
                subCountyCode,
                lastCaseId: 1
            }
        });
        return 1;
    }

    // If record exists, increment the lastCaseId and update the database
    const newCaseId = caseIdTracker.lastCaseId + 1;
    
    await prisma.caseIdTracker.update({
        where: {
            countryCode_subCountyCode: {
                countryCode,
                subCountyCode
            }
        },
        data: {
            lastCaseId: newCaseId
        }
    });

    return newCaseId;
};