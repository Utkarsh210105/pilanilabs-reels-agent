import pool from '../db.js';

async function createJob(type, detail) {
  const { rows } = await pool.query(
    'INSERT INTO jobs (type, detail) VALUES ($1, $2) RETURNING id',
    [type, detail ?? null],
  );
  return rows[0].id;
}

// Runs fn and records the outcome: 'completed' with its result or 'failed'
// with the error, so a failure at 6am is visible in the dashboard instead of
// only in a server log.
async function finishJob(jobId, fn) {
  try {
    const result = await fn(jobId);
    await pool.query(
      "UPDATE jobs SET status = 'completed', result = $1, finished_at = now() WHERE id = $2",
      [result === undefined ? null : JSON.stringify(result), jobId],
    );
    return result;
  } catch (err) {
    await pool.query(
      "UPDATE jobs SET status = 'failed', error = $1, finished_at = now() WHERE id = $2",
      [err.message, jobId],
    ).catch((e) => console.error('[jobs] could not record failure:', e.message));
    throw err;
  }
}

export async function runJob(type, detail, fn) {
  return finishJob(await createJob(type, detail), fn);
}

// Starts a job without waiting for it and returns its id, so an HTTP route can
// answer right away and the dashboard can poll GET /api/jobs/:id.
export async function startJob(type, detail, fn) {
  const jobId = await createJob(type, detail);
  finishJob(jobId, fn).catch((err) => console.error(`[jobs] ${type} failed:`, err.message));
  return jobId;
}

// A progress note on a running job ("Transcribing", "Rendering"...), shown in
// the dashboard while it polls. finishJob overwrites it with the result.
export async function setJobProgress(jobId, stage) {
  await pool.query("UPDATE jobs SET result = $1 WHERE id = $2 AND status = 'running'", [JSON.stringify({ stage }), jobId])
    .catch(() => {});
}

// The job of this type still running, if any. Matches the 20-minute cutoff
// the scheduler uses to mark abandoned jobs failed.
export async function runningJob(type) {
  const { rows } = await pool.query(
    `SELECT id, type, status, detail, started_at FROM jobs
     WHERE type = $1 AND status = 'running' AND started_at > now() - interval '20 minutes'
     ORDER BY started_at DESC LIMIT 1`,
    [type],
  );
  return rows[0] || null;
}
