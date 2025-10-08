"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv = __importStar(require("dotenv"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
// Define rate limit options
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later'
});
dotenv.config(); // Load environment variables
//Import routes
const client_auth_1 = __importDefault(require("./routes/client-auth"));
const provider_auth_1 = __importDefault(require("./routes/provider-auth"));
const app = (0, express_1.default)();
const PORT = 3000;
// app.use(limiter);
app.use((0, cors_1.default)());
app.use((req, res, next) => {
    try {
        // Starts when a new request is received by the server
        console.log(`${new Date().toUTCString()} : The Auth Service has received ${req.method} request from ${req.hostname} on ${req.path}`);
        next();
    }
    catch (error) {
        // Starts when a new request is received by the server
        res.json(error);
        return;
    }
});
app.use('/client', client_auth_1.default);
app.use('/provider', provider_auth_1.default);
// app.use('/reports', Reports)
app.listen(PORT, () => {
    console.log(`⚡️[server]: Server is running at http://localhost:${PORT}`);
});
