import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set — copy api/.env.example to api/.env');
}

// Supabase needs TLS; a local Docker Postgres does not speak it at all.
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);

const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: Number(process.env.PG_POOL_MAX) || 10,
});

// Supabase resets idle connections now and then. Without a listener, that
// 'error' event is unhandled and takes the whole server down.
pool.on('error', (err) => {
  console.error('[db] Idle client error (pool will reconnect):', err.message);
});

export default pool;
