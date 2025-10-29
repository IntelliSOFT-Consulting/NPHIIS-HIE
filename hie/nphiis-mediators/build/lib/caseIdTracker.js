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
    // Check if a record exists for this country, county, subcounty, and condition combination
    const caseIdTracker = yield prisma.caseIdTracker.findUnique({
        where: {
            countryCode_subCountyCode_conditionCode: {
                countryCode,
                subCountyCode,
                conditionCode
            }
        }
    });
    if (!caseIdTracker) {
        // If no record exists, create a new one with lastCaseId = 1
        yield prisma.caseIdTracker.create({
            data: {
                countryCode,
                countyCode,
                subCountyCode,
                conditionCode,
                lastCaseId: 1
            }
        });
        return 1;
    }
    // If record exists, increment the lastCaseId and update the database
    const newCaseId = caseIdTracker.lastCaseId + 1;
    yield prisma.caseIdTracker.update({
        where: {
            countryCode_subCountyCode_conditionCode: {
                countryCode,
                subCountyCode,
                conditionCode
            }
        },
        data: {
            lastCaseId: newCaseId
        }
    });
    return newCaseId;
});
exports.generateCaseId = generateCaseId;
