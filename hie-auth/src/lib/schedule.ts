import { CronJob } from 'cron';
import { sendDueNotifications } from './notification';
import { runEncounterBackfillJob } from './encounter-backfill-job';

// Notification cron job - runs daily at 6:30 AM EAT (3:30 AM UTC)
// 30 3 * * * = 3:30 AM UTC = 6:30 AM EAT (UTC+3)
const notificationCronSchedule = '30 3 * * *';

const notificationCronJob = new CronJob(notificationCronSchedule, async () => {
    await sendDueNotifications();
});

notificationCronJob.start();

console.log('Notification cron job started (runs daily at 6:30 AM EAT).');

// Full Encounter backfill: EPID assignment + AFP follow-up observations (optional cron)
let encounterBackfillCronJob: CronJob | null = null;
if (process.env.ENCOUNTER_BACKFILL_CRON_ENABLED === 'true') {
    const encounterBackfillCronSchedule =
        process.env.ENCOUNTER_BACKFILL_CRON_SCHEDULE || '0 2 * * 0';
    encounterBackfillCronJob = new CronJob(encounterBackfillCronSchedule, async () => {
        console.log('[EncounterBackfill] Cron starting…');
        try {
            await runEncounterBackfillJob();
        } catch (e) {
            console.error('[EncounterBackfill] Cron error:', e);
        }
    });
    encounterBackfillCronJob.start();
    console.log(
        `Encounter backfill cron started (schedule: ${encounterBackfillCronSchedule}). Set ENCOUNTER_BACKFILL_DELAY_MS to throttle FHIR calls.`
    );
}

process.on('SIGINT', () => {
    console.log('Stopping cron jobs...');
    notificationCronJob.stop();
    encounterBackfillCronJob?.stop();
    process.exit();
});
