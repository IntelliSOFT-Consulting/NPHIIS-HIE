"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
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
exports.installChannels = exports.importMediators = exports.getOpenHIMToken = exports.registerMediators = void 0;
const openhim_mediator_utils_1 = __importDefault(require("openhim-mediator-utils"));
const https_1 = require("https");
const fetch = (url, init) => Promise.resolve().then(() => __importStar(require('node-fetch'))).then(({ default: fetch }) => fetch(url, init));
const mediatorConfig_json_1 = __importDefault(require("../config/mediatorConfig.json"));
const mediators = [
    mediatorConfig_json_1.default
];
// OpenHIM Configuration 
const openhimApiUrl = process.env.OPENHIM_API_URL;
const openhimUsername = process.env.OPENHIM_USERNAME;
const openhimPassword = process.env.OPENHIM_PASSWORD;
const openhimConfig = {
    apiURL: openhimApiUrl,
    username: openhimUsername,
    password: openhimPassword,
    trustSelfSigned: true
};
const registerMediators = () => {
    openhim_mediator_utils_1.default.authenticate(openhimConfig, (e) => {
        console.log(e ? e : "✅ OpenHIM authenticated successfully\nImporting Mediators...");
        exports.importMediators();
        console.log(e ? e : "✅ OpenHIM mediators imported successfully");
        exports.installChannels();
        console.log(e ? e : "✅ OpenHIM channels installed successfully");
    });
};
exports.registerMediators = registerMediators;
const getOpenHIMToken = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // console.log("Auth", auth)
        let token = yield openhim_mediator_utils_1.default.genAuthHeaders(openhimConfig);
        return token;
    }
    catch (error) {
        console.log(error);
        return { error, status: "error" };
    }
});
exports.getOpenHIMToken = getOpenHIMToken;
const importMediators = () => {
    try {
        mediators.map((mediator) => {
            openhim_mediator_utils_1.default.registerMediator(openhimConfig, mediator, (e) => {
                console.log(e ? e : "");
            });
        });
    }
    catch (error) {
        console.log(error);
    }
    return;
};
exports.importMediators = importMediators;
const installChannels = () => __awaiter(void 0, void 0, void 0, function* () {
    let headers = yield exports.getOpenHIMToken();
    mediators.map((mediator) => __awaiter(void 0, void 0, void 0, function* () {
        let response = yield (yield fetch(`${openhimApiUrl}/channels`, {
            headers: Object.assign(Object.assign({}, headers), { "Content-Type": "application/json" }),
            method: 'POST', body: JSON.stringify(mediator.defaultChannelConfig[0]),
            agent: new https_1.Agent({
                rejectUnauthorized: false
            })
        })).text();
        console.log(response);
    }));
});
exports.installChannels = installChannels;
