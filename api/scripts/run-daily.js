// Runs the daily news pipeline once from the command line: npm run daily
import pool from '../db.js';
import { runJob } from '../lib/jobs.js';
import { dailyRun } from '../pipeline/dailyRun.js';

try {
  const result = await runJob('daily_run', 'cli', () => dailyRun());
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
