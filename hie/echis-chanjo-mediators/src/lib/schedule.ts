import cron from 'cron';
import { FhirApi } from './utils';

// Define cron job function
const fetchReferralsJob = () => {
    // fetch referrals
    console.log('Cron job is running!');

    // get all patients

    let patients = (await FhirApi({url:`/Patient`})).data;
    patients = patients.entry;
    for(let patient of patients){
        let age = patient.resource?.birthDate;
        let immunizations = (await FhirApi({url: `/Immunization?subject=${patient.resource.id}&_all`})).data;
        immunizations = immunizations.entry;

        
        // mark missed immunizations

        // create service request
    }

    // get all immunizations.
    for 
};


// Define cron schedule (runs every minute in this example)
const cronSchedule = '* * * * *'; // format: second minute hour dayOfMonth month dayOfWeek

// Create a cron job instance
const cronJob = new cron.CronJob(cronSchedule, fetchReferralsJob);

// Start the cron job
cronJob.start();

// Log a message when the cron job starts
console.log('Cron job started.');

// Handle process exit gracefully
process.on('SIGINT', () => {
    console.log('Stopping cron job...');
    cronJob.stop();
    console.log('Cron job stopped.');
    process.exit();
});