// Dashboard login: "Sign in with Google", limited to ALLOWED_EMAILS.
//
// The browser gets a Google ID token from Google's sign-in button; we check
// it with Google (tokeninfo), confirm it was issued for our OAuth client and
// that the email is on the allow list, then set our own signed session cookie.
//
// When GOOGLE_CLIENT_ID is not set (running on the laptop), login is off and
// only requests from this computer are allowed, as before.
import { createHmac, timingSafeEqual } from 'crypto';

const COOKIE = 'reels_session';
const SESSION_DAYS = 7;

export const authEnabled = () => Boolean(process.env.GOOGLE_CLIENT_ID);

function allowedEmails() {
  return (process.env.ALLOWED_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
}

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be set (32+ characters) when login is enabled');
  return s;
}

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const sign = (data) => createHmac('sha256', secret()).update(data).digest('base64url');

export function makeSession({ email, name }) {
  const payload = b64(JSON.stringify({ email, name, exp: Date.now() + SESSION_DAYS * 86_400_000 }));
  return `${payload}.${sign(payload)}`;
}

export function readSession(cookieHeader) {
  const raw = String(cookieHeader || '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!raw) return null;
  const [payload, sig] = raw.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!s.exp || s.exp < Date.now()) return null;
    // Removing someone from ALLOWED_EMAILS ends their session on next request.
    if (!allowedEmails().includes(String(s.email).toLowerCase())) return null;
    return s;
  } catch {
    return null;
  }
}

export function sessionCookie(value, { clear = false } = {}) {
  const parts = [`${COOKIE}=${clear ? '' : value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Secure', `Max-Age=${clear ? 0 : SESSION_DAYS * 86400}`];
  return parts.join('; ');
}

// Checks a Google ID token and returns { email, name } if this person may log in.
export async function verifyGoogleCredential(credential) {
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`, { signal: AbortSignal.timeout(15_000) });
  const t = await res.json().catch(() => ({}));
  if (!res.ok || !t.email) throw Object.assign(new Error('Google sign-in failed. Try again.'), { status: 401 });
  if (t.aud !== process.env.GOOGLE_CLIENT_ID) throw Object.assign(new Error('Sign-in was not issued for this app.'), { status: 401 });
  if (t.email_verified !== 'true' && t.email_verified !== true) throw Object.assign(new Error('That Google email is not verified.'), { status: 401 });
  if (!allowedEmails().includes(t.email.toLowerCase())) throw Object.assign(new Error(`${t.email} does not have access. Ask the admin to add it.`), { status: 403 });
  return { email: t.email, name: t.name || t.email };
}
