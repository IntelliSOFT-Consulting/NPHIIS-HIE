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
exports.authenticateUser = void 0;
const notification_1 = require("./notification");
/**
 * Middleware to authenticate user by validating Bearer token
 * Extracts token from Authorization header and validates it
 * Attaches user info to request object for downstream use
 */
const authenticateUser = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        // Extract token from Authorization header
        const accessToken = (_a = req.headers.authorization) === null || _a === void 0 ? void 0 : _a.split(' ')[1];
        if (!accessToken) {
            return res.status(401).json({
                status: "error",
                error: "Bearer token is required but not provided"
            });
        }
        // Validate token and get user info
        const userInfo = yield (0, notification_1.getUserInfoFromToken)(accessToken);
        if (!userInfo) {
            return res.status(401).json({
                status: "error",
                error: "Invalid Bearer token provided"
            });
        }
        // Attach user info to request object
        req.userInfo = userInfo;
        // Continue to next middleware/route handler
        next();
    }
    catch (error) {
        console.error('Authentication error:', error);
        return res.status(500).json({
            status: "error",
            error: "Authentication failed"
        });
    }
});
exports.authenticateUser = authenticateUser;
