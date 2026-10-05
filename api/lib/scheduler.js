import cron from 'node-cron';
import pool from '../db.js';
import { runJob, runningJob } from './jobs.js';
import { dailyRun } from '../pipeline/dailyRun.js';
import { scrapeActiveCreators } from '../pipeline/creatorReels.js';

// 6:00 IST: AI news from the US lands overnight India time, so the morning
// run catches it fresh and scripts are waiting for review by the workday.
export function startScheduler() {
  if (process.env.DISABLE_SCHEDULER === 'true') {
    console.log('[scheduler] disabled by DISABLE_SCHEDULER');
    return;
  }
  cron.schedule('0 6 * * *', async () => {
    try {
      // Someone pressed "Sync news" just before 6am: that run covers it.
      if (await runningJob('daily_run')) return;
      await runJob('daily_run', 'scheduled 6am IST', () => dailyRun());
    } catch (err) {
      console.error('[scheduler] daily run failed:', err.message);
    }
  }, { timezone: 'Asia/Kolkata' });

  // Creator reels: Mondays 05:30 IST. Weekly is enough to catch a creator's
  // new outperformers and keeps Apify usage inside the free tier.
  cron.schedule('30 5 * * 1', async () => {
    if (!process.env.APIFY_TOKEN) return;
    try {
      if (await runningJob('scrape_creator')) return;
      await runJob('scrape_creator', 'scheduled weekly', () => scrapeActiveCreators());
    } catch (err) {
      console.error('[scheduler] creator scrape failed:', err.message);
    }
  }, { timezone: 'Asia/Kolkata' });

  // A job still 'running' after 20 minutes died with the process (a deploy or
  // crash mid-run); mark it failed so the dashboard does not spin forever.
  setInterval(() => {
    pool.query(
      `UPDATE jobs SET status = 'failed', error = 'Timed out (server restarted or stalled)', finished_at = now()
       WHERE status = 'running' AND started_at < now() - interval '20 minutes'`,
    ).catch((err) => console.error('[scheduler] stuck-job cleanup failed:', err.message));
  }, 60_000);

  console.log('[scheduler] daily news run at 06:00 IST');
}
