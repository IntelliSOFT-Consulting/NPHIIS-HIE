import * as admin from 'firebase-admin';

import serviceAccountKey from '../config/serviceAccountKey.json';

// Types for notification payloads
export interface NotificationPayload {
  title: string;
  body: string;
  imageUrl?: string;
  icon?: string;
  clickAction?: string;
}

export interface DataPayload {
  [key: string]: string;
}

export interface FCMMessage {
  notification?: NotificationPayload;
  data?: DataPayload;
  token?: string;
  tokens?: string[];
  topic?: string;
  condition?: string;
  android?: admin.messaging.AndroidConfig;
  apns?: admin.messaging.ApnsConfig;
  webpush?: admin.messaging.WebpushConfig;
}

export interface FCMResponse {
  success: boolean;
  messageId?: string;
  messageIds?: string[];
  failureCount?: number;
  successCount?: number;
  error?: string;
  responses?: admin.messaging.SendResponse[];
}

/**
 * FCM Service for sending push notifications
 */
class FCMService {
  private initialized: boolean = false;

  initialize(serviceAccount?: string | admin.ServiceAccount, databaseURL?: string): void {
    try {
      if (this.initialized) {
        console.log('Firebase Admin already initialized');
        return;
      }

      const config: admin.AppOptions = {};

      if (serviceAccount) {
        if (typeof serviceAccount === 'string') {
          const serviceAccountData = require(serviceAccount);
          config.credential = admin.credential.cert(serviceAccountData);
        } else {
          config.credential = admin.credential.cert(serviceAccount);
        }
      } else {
        config.credential = admin.credential.applicationDefault();
      }

      if (databaseURL) {
        config.databaseURL = databaseURL;
      }

      admin.initializeApp(config);
      this.initialized = true;
      console.log('Firebase Admin SDK initialized successfully');
    } catch (error) {
      console.error('Error initializing Firebase Admin SDK:', error);
      throw error;
    }
  }

  async sendToDevice(
    token: string,
    notification: NotificationPayload,
    data?: DataPayload
  ): Promise<FCMResponse> {
    try {
      if (!this.initialized) {
        throw new Error('FCM Service not initialized. Call initialize() first.');
      }

      const message: admin.messaging.Message = {
        token,
        notification: {
          title: notification.title,
          body: notification.body,
          imageUrl: notification.imageUrl,
        },
        data,
      };

      const response = await admin.messaging().send(message);

      return {
        success: true,
        messageId: response,
      };
    } catch (error: any) {
      console.error('Error sending notification to device:', error);
      return {
        success: false,
        error: error.message || 'Failed to send notification',
      };
    }
  }

  async sendToMultipleDevices(
    tokens: string[],
    notification: NotificationPayload,
    data?: DataPayload
  ): Promise<FCMResponse> {
    try {
      if (!this.initialized) {
        throw new Error('FCM Service not initialized. Call initialize() first.');
      }

      if (!tokens || tokens.length === 0) {
        throw new Error('No device tokens provided');
      }

      const promises = tokens.map((token) =>
        this.sendToDevice(token, notification, data)
      );

      const results = await Promise.all(promises);
      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.filter((r) => !r.success).length;

      return {
        success: failureCount === 0,
        successCount,
        failureCount,
      };
    } catch (error: any) {
      console.error('Error sending notification to multiple devices:', error);
      return {
        success: false,
        error: error.message || 'Failed to send notifications',
      };
    }
  }

  async sendToTopic(
    topic: string,
    notification: NotificationPayload,
    data?: DataPayload
  ): Promise<FCMResponse> {
    try {
      if (!this.initialized) {
        throw new Error('FCM Service not initialized. Call initialize() first.');
      }

      const message: admin.messaging.Message = {
        topic,
        notification: {
          title: notification.title,
          body: notification.body,
          imageUrl: notification.imageUrl,
        },
        data,
      };

      const response = await admin.messaging().send(message);

      return {
        success: true,
        messageId: response,
      };
    } catch (error: any) {
      console.error('Error sending notification to topic:', error);
      return {
        success: false,
        error: error.message || 'Failed to send notification to topic',
      };
    }
  }

  async sendCustomMessage(message: FCMMessage): Promise<FCMResponse> {
    try {
      if (!this.initialized) {
        throw new Error('FCM Service not initialized. Call initialize() first.');
      }

      const baseMessage: any = {
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

      let fcmMessage: admin.messaging.Message;
      if (message.token) {
        fcmMessage = { ...baseMessage, token: message.token };
      } else if (message.topic) {
        fcmMessage = { ...baseMessage, topic: message.topic };
      } else if (message.condition) {
        fcmMessage = { ...baseMessage, condition: message.condition };
      } else {
        throw new Error('Message must have a token, topic, or condition');
      }

      const response = await admin.messaging().send(fcmMessage);

      return {
        success: true,
        messageId: response,
      };
    } catch (error: any) {
      console.error('Error sending custom FCM message:', error);
      return {
        success: false,
        error: error.message || 'Failed to send custom message',
      };
    }
  }

  async subscribeToTopic(tokens: string[], topic: string): Promise<FCMResponse> {
    try {
      if (!this.initialized) {
        throw new Error('FCM Service not initialized. Call initialize() first.');
      }

      const response = await admin.messaging().subscribeToTopic(tokens, topic);

      return {
        success: response.failureCount === 0,
        successCount: response.successCount,
        failureCount: response.failureCount,
      };
    } catch (error: any) {
      console.error('Error subscribing to topic:', error);
      return {
        success: false,
        error: error.message || 'Failed to subscribe to topic',
      };
    }
  }

  async unsubscribeFromTopic(tokens: string[], topic: string): Promise<FCMResponse> {
    try {
      if (!this.initialized) {
        throw new Error('FCM Service not initialized. Call initialize() first.');
      }

      const response = await admin.messaging().unsubscribeFromTopic(tokens, topic);

      return {
        success: response.failureCount === 0,
        successCount: response.successCount,
        failureCount: response.failureCount,
      };
    } catch (error: any) {
      console.error('Error unsubscribing from topic:', error);
      return {
        success: false,
        error: error.message || 'Failed to unsubscribe from topic',
      };
    }
  }

  async sendDataMessage(token: string, data: DataPayload): Promise<FCMResponse> {
    try {
      if (!this.initialized) {
        throw new Error('FCM Service not initialized. Call initialize() first.');
      }

      const message: admin.messaging.Message = {
        token,
        data,
      };

      const response = await admin.messaging().send(message);

      return {
        success: true,
        messageId: response,
      };
    } catch (error: any) {
      console.error('Error sending data message:', error);
      return {
        success: false,
        error: error.message || 'Failed to send data message',
      };
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

const fcmService = new FCMService();
fcmService.initialize(serviceAccountKey as admin.ServiceAccount);

export { fcmService };
