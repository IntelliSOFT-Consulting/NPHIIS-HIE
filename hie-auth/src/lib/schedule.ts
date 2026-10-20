import { CronJob } from 'cron';
import { sendDueNotifications } from './notification';
import { runVhfContactDailyJob, sendVhfContactReminders } from './vhf-contact-reminders';
import { runEncounterBackfillJob } from './encounter-backfill-job';
import { backfillResultReports, pollLabStagingResults, pollOpenNphlTasks } from './nphl-lab-sync';

// Notification cron job - runs daily at 6:30 AM EAT (3:30 AM UTC)
// 30 3 * * * = 3:30 AM UTC = 6:30 AM EAT (UTC+3)
const notificationCronSchedule = '30 3 * * *';

const notificationCronJob = new CronJob(notificationCronSchedule, async () => {
    await sendDueNotifications();
});

notificationCronJob.start();

console.log('Notification cron job started (runs daily at 6:30 AM EAT).');

// VHF contact follow-up: rebuild contact Lists, promote converted contacts, queue and send reminders.
// Default 5:45 AM EAT (2:45 AM UTC), before officers start the day's follow ups.
const vhfContactCronSchedule = process.env.VHF_CONTACT_CRON_SCHEDULE || '45 2 * * *';
const vhfContactCronJob =
    process.env.VHF_CONTACT_CRON_ENABLED === 'false'
        ? null
        : new CronJob(vhfContactCronSchedule, async () => {
              try {
                  await runVhfContactDailyJob();
                  await sendVhfContactReminders();
              } catch (e) {
                  console.error('[VhfContacts] Cron error:', e);
              }
          });
vhfContactCronJob?.start();
if (vhfContactCronJob) console.log(`VHF contact follow-up cron started (schedule: ${vhfContactCronSchedule}).`);

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

// One-off on startup: DiagnosticReport and per-test Observations for results stored before
// they existed. Skips Tasks that already link a report.
backfillResultReports()
    .then((s) => s.backfilled && console.log(`[NPHL] Backfilled ${s.backfilled} lab report(s) (${s.errors} error(s))`))
    .catch((e) => console.error('[NPHL] Report backfill error:', e));

// NPHL lab staging API: pull results that are ready (GET /list) for specimens still open.
let labStagingCronJob: CronJob | null = null;
if (process.env.LAB_STAGING_API_KEY && process.env.LAB_STAGING_POLL_CRON_ENABLED !== 'false') {
    const labStagingCronSchedule = process.env.LAB_STAGING_POLL_CRON_SCHEDULE || '15,45 * * * *';
    labStagingCronJob = new CronJob(labStagingCronSchedule, async () => {
        try {
            const stats = await pollLabStagingResults();
            if (stats && !('error' in stats)) {
                console.log(`[NPHL] Lab staging pull: ${stats.rows} row(s), ${stats.open} open specimen(s), ${stats.matched} updated`);
            }
        } catch (e) {
            console.error('[NPHL] Lab staging cron error:', e);
        }
    });
    labStagingCronJob.start();
    console.log(`NPHL lab staging pull started (schedule: ${labStagingCronSchedule}).`);
}

process.on('SIGINT', () => {
    console.log('Stopping cron jobs...');
    notificationCronJob.stop();
    encounterBackfillCronJob?.stop();
    nphlPollCronJob?.stop();
    labStagingCronJob?.stop();
    vhfContactCronJob?.stop();
    process.exit();
});
