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
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCaseId = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const generateCaseId = (countryCode, countyCode, subCountyCode, conditionCode) => __awaiter(void 0, void 0, void 0, function* () {
    const normalizedCountry = typeof countryCode === "string" ? countryCode.trim() : "";
    const normalizedCounty = typeof countyCode === "string" ? countyCode.trim() : "";
    const normalizedSubCounty = typeof subCountyCode === "string" ? subCountyCode.trim() : "";
    const normalizedCondition = typeof conditionCode === "string" ? conditionCode.trim() : "";
    // With countyCode included in the unique key, all four fields are required
    if (!normalizedCountry || !normalizedCounty || !normalizedSubCounty || !normalizedCondition) {
        throw new Error(`Missing required codes for case id generation: { countryCode: ${JSON.stringify(normalizedCountry)}, countyCode: ${JSON.stringify(normalizedCounty)}, subCountyCode: ${JSON.stringify(normalizedSubCounty)}, conditionCode: ${JSON.stringify(normalizedCondition)} }`);
    }
    // Check if a record exists for this country, county, subcounty, and condition combination
    const caseIdTracker = yield prisma.caseIdTracker.findUnique({
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
        yield prisma.caseIdTracker.create({
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
    yield prisma.caseIdTracker.update({
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
});
exports.generateCaseId = generateCaseId;
