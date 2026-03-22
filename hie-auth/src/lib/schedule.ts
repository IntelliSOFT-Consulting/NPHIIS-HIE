import { CronJob } from 'cron';
import { sendDueNotifications } from './notification';

// Notification cron job - runs daily at 6:30 AM EAT (3:30 AM UTC)
// 30 3 * * * = 3:30 AM UTC = 6:30 AM EAT (UTC+3)
const notificationCronSchedule = '30 3 * * *';

const notificationCronJob = new CronJob(notificationCronSchedule, async () => {
    await sendDueNotifications();
});

notificationCronJob.start();

console.log('Notification cron job started (runs daily at 6:30 AM EAT).');

process.on('SIGINT', () => {
    console.log('Stopping notification cron job...');
    notificationCronJob.stop();
    process.exit();
});
