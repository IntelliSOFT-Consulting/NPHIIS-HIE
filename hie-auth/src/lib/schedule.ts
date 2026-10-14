import { CronJob } from 'cron';
import { sendDueNotifications } from './notification';
import { runEncounterBackfillJob } from './encounter-backfill-job';
import { pollOpenNphlTasks } from './nphl-lab-sync';

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

// NPHL lab results: re-post cases whose specimens have no final result yet (NPHL has no
// results-only endpoint; the POST response carries the latest results).
let nphlPollCronJob: CronJob | null = null;
if (process.env.NPHL_SURVEILLANCE_API_KEY && process.env.NPHL_POLL_CRON_ENABLED !== 'false') {
    const nphlPollCronSchedule = process.env.NPHL_POLL_CRON_SCHEDULE || '*/30 * * * *';
    nphlPollCronJob = new CronJob(nphlPollCronSchedule, async () => {
        try {
            const stats = await pollOpenNphlTasks();
            if (stats) console.log(`[NPHL] Poll: ${stats.cases} case(s), ${stats.errors} error(s)`);
        } catch (e) {
            console.error('[NPHL] Poll cron error:', e);
        }
    });
    nphlPollCronJob.start();
    console.log(`NPHL lab result poll started (schedule: ${nphlPollCronSchedule}).`);
}

process.on('SIGINT', () => {
    console.log('Stopping cron jobs...');
    notificationCronJob.stop();
    encounterBackfillCronJob?.stop();
    nphlPollCronJob?.stop();
    process.exit();
});
