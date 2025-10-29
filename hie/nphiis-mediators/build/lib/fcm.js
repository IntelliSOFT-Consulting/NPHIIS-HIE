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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.fcmService = void 0;
const admin = __importStar(require("firebase-admin"));
const serviceAccountKey_json_1 = __importDefault(require("../config/serviceAccountKey.json"));
/**
 * FCM Service for sending push notifications
 */
class FCMService {
    constructor() {
        this.initialized = false;
    }
    /**
     * Initialize Firebase Admin SDK
     * @param serviceAccount - Service account object or path to Firebase service account JSON file
     * @param databaseURL - Firebase Realtime Database URL (optional)
     */
    initialize(serviceAccount, databaseURL) {
        try {
            if (this.initialized) {
                console.log('Firebase Admin already initialized');
                return;
            }
            const config = {};
            if (serviceAccount) {
                if (typeof serviceAccount === 'string') {
                    // It's a file path, require it
                    const serviceAccountData = require(serviceAccount);
                    config.credential = admin.credential.cert(serviceAccountData);
                }
                else {
                    // It's already a service account object
                    config.credential = admin.credential.cert(serviceAccount);
                }
            }
            else {
                // Use default credentials from environment
                config.credential = admin.credential.applicationDefault();
            }
            if (databaseURL) {
                config.databaseURL = databaseURL;
            }
            admin.initializeApp(config);
            this.initialized = true;
            console.log('Firebase Admin SDK initialized successfully');
        }
        catch (error) {
            console.error('Error initializing Firebase Admin SDK:', error);
            throw error;
        }
    }
    /**
     * Send notification to a single device
     * @param token - FCM device token
     * @param notification - Notification payload
     * @param data - Optional data payload
     * @returns FCMResponse
     */
    sendToDevice(token, notification, data) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!this.initialized) {
                    throw new Error('FCM Service not initialized. Call initialize() first.');
                }
                const message = {
                    token,
                    notification: {
                        title: notification.title,
                        body: notification.body,
                        imageUrl: notification.imageUrl,
                    },
                    data,
                };
                const response = yield admin.messaging().send(message);
                return {
                    success: true,
                    messageId: response,
                };
            }
            catch (error) {
                console.error('Error sending notification to device:', error);
                return {
                    success: false,
                    error: error.message || 'Failed to send notification',
                };
            }
        });
    }
    /**
     * Send notification to multiple devices
     * @param tokens - Array of FCM device tokens
     * @param notification - Notification payload
     * @param data - Optional data payload
     * @returns FCMResponse
     */
    sendToMultipleDevices(tokens, notification, data) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!this.initialized) {
                    throw new Error('FCM Service not initialized. Call initialize() first.');
                }
                if (!tokens || tokens.length === 0) {
                    throw new Error('No device tokens provided');
                }
                // Send to each device individually and collect results
                const promises = tokens.map((token) => this.sendToDevice(token, notification, data));
                const results = yield Promise.all(promises);
                const successCount = results.filter((r) => r.success).length;
                const failureCount = results.filter((r) => !r.success).length;
                return {
                    success: failureCount === 0,
                    successCount,
                    failureCount,
                };
            }
            catch (error) {
                console.error('Error sending notification to multiple devices:', error);
                return {
                    success: false,
                    error: error.message || 'Failed to send notifications',
                };
            }
        });
    }
    /**
     * Send notification to a topic
     * @param topic - FCM topic name
     * @param notification - Notification payload
     * @param data - Optional data payload
     * @returns FCMResponse
     */
    sendToTopic(topic, notification, data) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!this.initialized) {
                    throw new Error('FCM Service not initialized. Call initialize() first.');
                }
                const message = {
                    topic,
                    notification: {
                        title: notification.title,
                        body: notification.body,
                        imageUrl: notification.imageUrl,
                    },
                    data,
                };
                const response = yield admin.messaging().send(message);
                return {
                    success: true,
                    messageId: response,
                };
            }
            catch (error) {
                console.error('Error sending notification to topic:', error);
                return {
                    success: false,
                    error: error.message || 'Failed to send notification to topic',
                };
            }
        });
    }
    /**
     * Send a custom FCM message with advanced options
     * @param message - Custom FCM message configuration
     * @returns FCMResponse
     */
    sendCustomMessage(message) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!this.initialized) {
                    throw new Error('FCM Service not initialized. Call initialize() first.');
                }
                // Build the base message properties
                const baseMessage = {
                    notification: message.notification ? {
                        title: message.notification.title,
                        body: message.notification.body,
                        imageUrl: message.notification.imageUrl,
                    } : undefined,
                    data: message.data,
                    android: message.android,
                    apns: message.apns,
                    webpush: message.webpush,
                };
                // Add target (token, topic, or condition)
                let fcmMessage;
                if (message.token) {
                    fcmMessage = Object.assign(Object.assign({}, baseMessage), { token: message.token });
                }
                else if (message.topic) {
                    fcmMessage = Object.assign(Object.assign({}, baseMessage), { topic: message.topic });
                }
                else if (message.condition) {
                    fcmMessage = Object.assign(Object.assign({}, baseMessage), { condition: message.condition });
                }
                else {
                    throw new Error('Message must have a token, topic, or condition');
                }
                const response = yield admin.messaging().send(fcmMessage);
                return {
                    success: true,
                    messageId: response,
                };
            }
            catch (error) {
                console.error('Error sending custom FCM message:', error);
                return {
                    success: false,
                    error: error.message || 'Failed to send custom message',
                };
            }
        });
    }
    /**
     * Subscribe devices to a topic
     * @param tokens - Array of device tokens
     * @param topic - Topic name
     * @returns Success status
     */
    subscribeToTopic(tokens, topic) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!this.initialized) {
                    throw new Error('FCM Service not initialized. Call initialize() first.');
                }
                const response = yield admin.messaging().subscribeToTopic(tokens, topic);
                return {
                    success: response.failureCount === 0,
                    successCount: response.successCount,
                    failureCount: response.failureCount,
                };
            }
            catch (error) {
                console.error('Error subscribing to topic:', error);
                return {
                    success: false,
                    error: error.message || 'Failed to subscribe to topic',
                };
            }
        });
    }
    /**
     * Unsubscribe devices from a topic
     * @param tokens - Array of device tokens
     * @param topic - Topic name
     * @returns Success status
     */
    unsubscribeFromTopic(tokens, topic) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!this.initialized) {
                    throw new Error('FCM Service not initialized. Call initialize() first.');
                }
                const response = yield admin.messaging().unsubscribeFromTopic(tokens, topic);
                return {
                    success: response.failureCount === 0,
                    successCount: response.successCount,
                    failureCount: response.failureCount,
                };
            }
            catch (error) {
                console.error('Error unsubscribing from topic:', error);
                return {
                    success: false,
                    error: error.message || 'Failed to unsubscribe from topic',
                };
            }
        });
    }
    /**
     * Send data-only message (no notification)
     * @param token - FCM device token
     * @param data - Data payload
     * @returns FCMResponse
     */
    sendDataMessage(token, data) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!this.initialized) {
                    throw new Error('FCM Service not initialized. Call initialize() first.');
                }
                const message = {
                    token,
                    data,
                };
                const response = yield admin.messaging().send(message);
                return {
                    success: true,
                    messageId: response,
                };
            }
            catch (error) {
                console.error('Error sending data message:', error);
                return {
                    success: false,
                    error: error.message || 'Failed to send data message',
                };
            }
        });
    }
    /**
     * Check if the service is initialized
     * @returns boolean
     */
    isInitialized() {
        return this.initialized;
    }
}
// Export singleton instance
const fcmService = new FCMService();
exports.fcmService = fcmService;
fcmService.initialize(serviceAccountKey_json_1.default);
