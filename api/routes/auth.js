import { Router } from 'express';
import { authEnabled, makeSession, readSession, sessionCookie, verifyGoogleCredential } from '../lib/auth.js';

const router = Router();

// Who is logged in. 401 tells the dashboard to show the sign-in page, with
// the Google client id it needs to draw the button.
router.get('/me', (req, res) => {
  if (!authEnabled()) return res.json({ email: 'local', name: 'This computer', local: true });
  const s = readSession(req.headers.cookie);
  if (!s) return res.status(401).json({ error: 'Not signed in', client_id: process.env.GOOGLE_CLIENT_ID });
  res.json({ email: s.email, name: s.name });
});

router.post('/google', async (req, res, next) => {
  try {
    if (!authEnabled()) return res.status(400).json({ error: 'Login is not enabled on this server' });
    const user = await verifyGoogleCredential(String(req.body?.credential || ''));
    res.setHeader('Set-Cookie', sessionCookie(makeSession(user)));
    res.json(user);
  } catch (err) { next(err); }
});

router.post('/logout', (req, res) => {
  res.setHeader('Set-Cookie', sessionCookie('', { clear: true }));
  res.json({ ok: true });
});

export default router;
