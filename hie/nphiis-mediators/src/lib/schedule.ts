import cron from 'cron';
import { FhirApi } from './utils';
import { sendDueNotifications } from './notification';

// Define cron job function
const fetchReferralsJob = async () => {
    // fetch referrals
    console.log('Cron job is running!');

    // get all patients

    let patients = (await FhirApi({url:`/Patient`})).data;
    patients = patients.entry;
    for(let patient of patients){
        let age = patient.resource?.birthDate;
        let immunizations = (await FhirApi({url: `/Encounter?subject=${patient.resource.id}&_all`})).data;
        immunizations = immunizations.entry;

        
        // mark missed immunizations

        // create service request
    }

    // get all immunizations.
    // for 
};


// Define cron schedule (runs every minute in this example)
const cronSchedule = '0 * * * *'; // format: second minute hour dayOfMonth month dayOfWeek

// Create a cron job instance
const cronJob = new cron.CronJob(cronSchedule, fetchReferralsJob);

// Start the cron job
cronJob.start();

// Log a message when the cron job starts
console.log('Cron job started.');

// Notification cron job - runs daily at 6:30 AM EAT (3:30 AM UTC)
// Cron pattern: minute hour dayOfMonth month dayOfWeek
// 30 3 * * * = 3:30 AM UTC = 6:30 AM EAT (UTC+3)
const notificationCronSchedule = '30 3 * * *';

const notificationCronJob = new cron.CronJob(notificationCronSchedule, async () => {
    await sendDueNotifications();
});

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