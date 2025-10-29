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
const fcm_1 = require("../lib/fcm");
const auth_1 = require("../lib/auth");
const prisma_1 = require("../lib/prisma");
exports.router = express_1.default.Router();
exports.router.use(express_1.default.json());
exports.router.post('/send', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let { token, title, body } = req.body;
        let response = yield fcm_1.fcmService.sendToDevice(token, { title, body });
        return res.status(200).json(Object.assign(Object.assign({}, response), { status: "success" }));
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({
            status: "error",
            error: `Failed to send notification - ${JSON.stringify(error)}`
        });
    }
}));
exports.router.post('/config', auth_1.authenticateUser, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let data = req.body;
        const userInfo = req.userInfo;
        // create or update the user's notification settings
        const notificationRecipient = yield prisma_1.prisma.notificationRecipient.create({
            data: {
                token: data === null || data === void 0 ? void 0 : data.token,
                practitionerId: userInfo === null || userInfo === void 0 ? void 0 : userInfo.id,
            }
        });
        const practitioner = (yield (0, utils_1.FhirApi)({ url: `/Practitioner/${userInfo.id}` })).data;
        return res.status(200).json({
            status: "success",
            practitioner: Object.assign(Object.assign({}, practitioner), { extension: [...(practitioner.extension || []), {
                        url: "http://example.org/fhir/StructureDefinition/notification-recipient",
                        valueReference: {
                            reference: `NotificationRecipient/${notificationRecipient.id}`,
                            display: notificationRecipient.token
                        }
                    }] })
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({
            status: "error",
            error: `Failed to configure notification - ${JSON.stringify(error)}`
        });
    }
}));
exports.router.get('/', auth_1.authenticateUser, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userInfo = req.userInfo;
        const notifications = yield prisma_1.prisma.notification.findMany({
            where: {
                practitionerId: userInfo.id
            }
        });
        return res.status(200).json({
            status: "success",
            notifications,
            total: notifications.length
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({
            status: "error",
            error: "Failed to get notifications"
        });
    }
}));
exports.default = exports.router;
