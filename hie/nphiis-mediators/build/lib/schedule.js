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
const cron_1 = __importDefault(require("cron"));
const utils_1 = require("./utils");
const notification_1 = require("./notification");
// Define cron job function
const fetchReferralsJob = () => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    // fetch referrals
    console.log('Cron job is running!');
    // get all patients
    let patients = (yield (0, utils_1.FhirApi)({ url: `/Patient` })).data;
    patients = patients.entry;
    for (let patient of patients) {
        let age = (_a = patient.resource) === null || _a === void 0 ? void 0 : _a.birthDate;
        let immunizations = (yield (0, utils_1.FhirApi)({ url: `/Encounter?subject=${patient.resource.id}&_all` })).data;
        immunizations = immunizations.entry;
        // mark missed immunizations
        // create service request
    }
    // get all immunizations.
    // for 
});
// Define cron schedule (runs every minute in this example)
const cronSchedule = '0 * * * *'; // format: second minute hour dayOfMonth month dayOfWeek
// Create a cron job instance
const cronJob = new cron_1.default.CronJob(cronSchedule, fetchReferralsJob);
// Start the cron job
cronJob.start();
// Log a message when the cron job starts
console.log('Cron job started.');
// Notification cron job - runs daily at 6:30 AM EAT (3:30 AM UTC)
// Cron pattern: minute hour dayOfMonth month dayOfWeek
// 30 3 * * * = 3:30 AM UTC = 6:30 AM EAT (UTC+3)
const notificationCronSchedule = '30 3 * * *';
const notificationCronJob = new cron_1.default.CronJob(notificationCronSchedule, () => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, notification_1.sendDueNotifications)();
}));
// Start the notification cron job
notificationCronJob.start();
console.log('Notification cron job started (runs daily at 6:30 AM EAT).');
// Handle process exit gracefully
process.on('SIGINT', () => {
    console.log('Stopping cron jobs...');
    cronJob.stop();
    notificationCronJob.stop();
    console.log('Cron jobs stopped.');
    process.exit();
});
