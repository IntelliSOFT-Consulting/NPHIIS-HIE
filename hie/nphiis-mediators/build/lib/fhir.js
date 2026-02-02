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
exports.processFollowUpObservations = exports.FhirIdentifier = exports.OperationOutcome = void 0;
const utils_1 = require("./utils");
let reasonCode = "mpox-register";
let OperationOutcome = (error) => {
    return {
        "resourceType": "OperationOutcome",
        "id": "exception",
        "issue": [{ "severity": "error", "code": "exception", "details": { "text": String(error) } }]
    };
};
exports.OperationOutcome = OperationOutcome;
const FhirIdentifier = (system, code, display, value, official = false) => {
    return { type: { coding: [{ system, code, display }] }, value, use: official ? "official" : "usual" };
};
exports.FhirIdentifier = FhirIdentifier;
const processFollowUpObservations = (encounterId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    let response = yield (yield (0, utils_1.FhirApi)({
        url: `/Observation?code=502488184403&encounter=${encounterId}`,
        method: "GET"
    })).data;
    // send observation to the follow up service
    if ((response === null || response === void 0 ? void 0 : response.total) > 0) {
        const followUpResponse = yield (0, utils_1.sendMediatorRequest)("/process-observations/afp-follow-up", (_b = (_a = response === null || response === void 0 ? void 0 : response.entry) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.resource);
        if ((followUpResponse === null || followUpResponse === void 0 ? void 0 : followUpResponse.status) === "success") {
            return {
                status: "success",
                message: "Follow up observations created successfully"
            };
        }
        return {
            status: "error",
            message: "Failed to create follow up observations"
        };
    }
    console.log("No follow up observations found");
    return {
        status: "success",
        message: "No follow up observations found"
    };
});
exports.processFollowUpObservations = processFollowUpObservations;
