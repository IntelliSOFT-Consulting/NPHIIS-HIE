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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = __importDefault(require("express"));
const utils_1 = require("../lib/utils");
const notification_1 = require("../lib/notification");
exports.router = express_1.default.Router();
exports.router.use(express_1.default.json());
function padStart(str, targetLength, padChar = '0') {
    while (str.length < targetLength) {
        str = padChar + str;
    }
    return str;
}
function toThreeDigits(num) {
    return padStart(num.toString(), 3);
}
//process FHIR beneficiary
exports.router.put('/notifications/Observation/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("🟢 Observation subscription triggered for ID:", req.params.id);
    try {
        let { id } = req.params;
        console.log("🟢 Fetching observation data...");
        let data = yield (yield (0, utils_1.FhirApi)({ url: `/Observation/${id}` })).data;
        console.log("🟢 About to call sendMediatorRequest...");
        let response = yield (0, utils_1.sendMediatorRequest)("/process-observations/create-notification", data);
        console.log("🟢 sendMediatorRequest returned:", response);
        res.statusCode = 200;
        return res.json((0, utils_1.OperationOutcome)('AFP Follow Up processed successfully', 'information'));
    }
    catch (error) {
        console.error("🔴 Error in Observation subscription:", error);
        return res.status(400).json((0, utils_1.OperationOutcome)('Failed to process AFP Follow Up', 'error'));
    }
}));
//process FHIR beneficiary
exports.router.post('/create-notification', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        let data = req.body;
        const response = yield (0, notification_1.processAfpObservation)(data);
        if ((response === null || response === void 0 ? void 0 : response.status) === "success") {
            return res.status(200).json((0, utils_1.OperationOutcome)('Notification created successfully', 'information'));
        }
        return res.status(400).json((0, utils_1.OperationOutcome)((_a = response === null || response === void 0 ? void 0 : response.error) !== null && _a !== void 0 ? _a : 'Failed to create notification', 'error'));
    }
    catch (error) {
        console.error(error);
        return res.status(400).json((0, utils_1.OperationOutcome)('Failed to create notification', 'error'));
    }
}));
exports.default = exports.router;
