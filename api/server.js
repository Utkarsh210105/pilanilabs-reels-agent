import 'dotenv/config';
import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import newsRouter from './routes/news.js';
import scriptsRouter from './routes/scripts.js';
import metaRouter from './routes/meta.js';
import creatorsRouter from './routes/creators.js';
import leadsRouter from './routes/leads.js';
import toolsRouter from './routes/tools.js';
import insightsRouter from './routes/insights.js';
import { startScheduler } from './lib/scheduler.js';
import { MEDIA_DIR } from './pipeline/renderReel.js';
import authRouter from './routes/auth.js';
import { authEnabled, readSession } from './lib/auth.js';

const app = express();
const PORT = process.env.PORT || 4100;

// Cloud Run sits behind Google's proxy: trust it for the client's protocol/IP.
app.set('trust proxy', true);

// Access rules.
// Always open: health check, the ManyChat webhook (it checks its own secret),
// sign-in, and the dashboard's static files (no data in them).
// Everything else under /api and /media:
//  - login on (GOOGLE_CLIENT_ID set, e.g. Cloud Run): a signed-in, allowed user
//  - login off (the laptop): requests from this computer only
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
app.use((req, res, next) => {
  const p = req.path;
  if (p === '/api/health' || p.startsWith('/api/auth/')) return next();
  if (req.method === 'POST' && p === '/api/leads/manychat') return next();
  if (!p.startsWith('/api/') && !p.startsWith('/media/')) return next();
  if (authEnabled()) {
    if (readSession(req.headers.cookie)) return next();
    return res.status(401).json({ error: 'Not signed in' });
  }
  if (LOCAL_HOSTS.has(req.hostname)) return next();
  res.status(404).json({ error: 'Not found' });
});

app.use(cors({ origin: process.env.DASHBOARD_ORIGIN || 'http://localhost:5174' }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.json({ status: 'PilaniLabs reels API is running' }));
app.use('/api/auth', authRouter);
// Uploaded avatar videos and rendered reels (local disk for now).
app.use('/media', express.static(MEDIA_DIR, { maxAge: '1h' }));
app.use('/api/news', newsRouter);
app.use('/api/scripts', scriptsRouter);
app.use('/api/creators', creatorsRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/tools', toolsRouter);
app.use('/api/insights', insightsRouter);
app.use('/api', metaRouter);

// The built dashboard (npm start builds it), so one server on one port runs
// everything. Any other path falls back to index.html for the React router.
const DASHBOARD_DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dashboard', 'dist');
if (existsSync(path.join(DASHBOARD_DIST, 'index.html'))) {
  app.use(express.static(DASHBOARD_DIST));
  app.get(/^\/(?!api\/|media\/).*/, (req, res) => res.sendFile(path.join(DASHBOARD_DIST, 'index.html')));
}

// Errors come back as { error } so the dashboard can show the real reason.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || (/not found/i.test(err.message) ? 404 : /required|unknown|cannot/i.test(err.message) ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`Reels agent running: open ${process.env.PUBLIC_URL || `http://localhost:${PORT}`}${authEnabled() ? ' (Google login on)' : ''}`);
  startScheduler();
});
