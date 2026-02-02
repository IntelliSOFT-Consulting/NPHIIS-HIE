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
exports.createFHIRSubscription = exports.createEpidFHIRSubscription = void 0;
const utils_1 = require("./utils");
/**
 * Delete all existing FHIR subscriptions before creating new ones
 */
const deleteAllSubscriptions = () => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        let response = yield (0, utils_1.FhirApi)({
            url: '/Subscription',
            method: 'GET'
        });
        const subscriptions = ((_a = response.data) === null || _a === void 0 ? void 0 : _a.entry) || [];
        for (const entry of subscriptions) {
            const id = (_b = entry.resource) === null || _b === void 0 ? void 0 : _b.id;
            if (id) {
                yield (0, utils_1.FhirApi)({
                    url: `/Subscription/${id}`,
                    method: 'DELETE'
                });
            }
        }
        console.log(`Deleted ${subscriptions.length} existing subscriptions`);
    }
    catch (error) {
        console.log('Error deleting subscriptions:', error);
    }
});
/**
 * General function to create a FHIR Subscription
 * @param subscriptionId - The ID for the subscription
 * @param callbackUrl - The endpoint URL to receive notifications
 * @param criteria - The FHIR search criteria for the subscription
 */
const createSubscription = (subscriptionId, callbackUrl, criteria) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let response = yield (yield (0, utils_1.FhirApi)({
            url: `/Subscription/${subscriptionId}`,
            method: "PUT",
            data: JSON.stringify({
                resourceType: 'Subscription',
                id: subscriptionId,
                status: "active",
                criteria: criteria,
                channel: {
                    type: 'rest-hook',
                    endpoint: callbackUrl,
                    payload: 'application/json'
                }
            })
        })).data;
        if (response.resourceType != "OperationOutcome") {
            console.log(`FHIR Subscription ID: ${subscriptionId}`);
            return;
        }
        console.log(`Failed to create FHIR Subscription: \n${JSON.stringify(response)}`);
    }
    catch (error) {
        console.log(error);
    }
});
let createEpidFHIRSubscription = () => __awaiter(void 0, void 0, void 0, function* () {
    let FHIR_EPID_SUBSCRIPTION_ID = process.env['FHIR_EPID_SUBSCRIPTION_ID'];
    let FHIR_ENCOUNTERS_SUBSCRIPTION_CALLBACK_URL = process.env['FHIR_ENCOUNTERS_SUBSCRIPTION_CALLBACK_URL'];
    if (!FHIR_EPID_SUBSCRIPTION_ID || !FHIR_ENCOUNTERS_SUBSCRIPTION_CALLBACK_URL) {
        console.log('Missing environment variables for Epid subscription');
        return;
    }
    yield createSubscription(FHIR_EPID_SUBSCRIPTION_ID, FHIR_ENCOUNTERS_SUBSCRIPTION_CALLBACK_URL, `Encounter?`);
});
exports.createEpidFHIRSubscription = createEpidFHIRSubscription;
const createFollowUpFHIRSubscription = () => __awaiter(void 0, void 0, void 0, function* () {
    let FHIR_AFP_FOLLOW_UP_SUBSCRIPTION_ID = process.env['FHIR_AFP_FOLLOW_UP_SUBSCRIPTION_ID'];
    let FHIR_OBSERVATIONS_SUBSCRIPTION_CALLBACK_URL = process.env['FHIR_OBSERVATIONS_SUBSCRIPTION_CALLBACK_URL'];
    if (!FHIR_AFP_FOLLOW_UP_SUBSCRIPTION_ID || !FHIR_OBSERVATIONS_SUBSCRIPTION_CALLBACK_URL) {
        console.log('Missing environment variables for Follow-up subscription');
        return;
    }
    yield createSubscription(FHIR_AFP_FOLLOW_UP_SUBSCRIPTION_ID, FHIR_OBSERVATIONS_SUBSCRIPTION_CALLBACK_URL, `Observation?code=502488184403`);
});
let createFHIRSubscription = () => __awaiter(void 0, void 0, void 0, function* () {
    yield deleteAllSubscriptions();
    yield (0, exports.createEpidFHIRSubscription)();
    // await createFollowUpFHIRSubscription();
});
exports.createFHIRSubscription = createFHIRSubscription;
