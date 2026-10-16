// Temporary public links to one media file, for Instagram to download a reel
// (its API needs a video_url). A link names one file, expires, and is signed,
// so nothing else in the media folder becomes reachable.
import { spawn } from 'child_process';
import { createHmac, timingSafeEqual } from 'crypto';
import { Resolver } from 'dns/promises';

function key() {
  const k = process.env.SESSION_SECRET || process.env.LEADS_WEBHOOK_SECRET;
  if (!k) throw new Error('Set SESSION_SECRET (or LEADS_WEBHOOK_SECRET) to sign media links');
  return k;
}

const sig = (rel, exp) => createHmac('sha256', key()).update(`${rel}\n${exp}`).digest('base64url');

export function signedMediaPath(rel, ttlSeconds = 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `/api/public-media/${rel.split('/').map(encodeURIComponent).join('/')}?exp=${exp}&sig=${sig(rel, exp)}`;
}

export function verifyMediaSignature(rel, exp, given) {
  if (!rel || rel.includes('..') || !/^\d+$/.test(String(exp)) || Number(exp) < Date.now() / 1000) return false;
  const expected = sig(rel, exp);
  return typeof given === 'string' && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

// Runs fn(baseUrl) with a public https address for this server: PUBLIC_URL
// when deployed, otherwise a temporary Cloudflare quick tunnel to this laptop
// that is closed as soon as fn finishes. Only signed media links and the
// webhook answer through it (see the access rules in server.js).
export async function withPublicBaseUrl(fn) {
  if (process.env.PUBLIC_URL) return fn(process.env.PUBLIC_URL.replace(/\/$/, ''));

  const port = process.env.PORT || 4100;
  const bin = process.env.CLOUDFLARED_PATH || 'cloudflared';
  const proc = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`], { windowsHide: true });
  try {
    const base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Could not open a temporary public link (cloudflared did not start in 40s)')), 40_000);
      const onData = (d) => {
        const m = d.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (m) { clearTimeout(timer); resolve(m[0]); }
      };
      proc.stdout.on('data', onData);
      proc.stderr.on('data', onData);
      proc.on('error', (e) => { clearTimeout(timer); reject(new Error(`cloudflared is not available (${e.message}). Install it or set PUBLIC_URL.`)); });
      proc.on('exit', (code) => { clearTimeout(timer); reject(new Error(`cloudflared exited (${code})`)); });
    });
    // Wait until the new hostname resolves on public DNS (what Instagram's
    // servers use). The laptop's own ISP DNS can lag or fail for new
    // trycloudflare names, so it is not a useful check here.
    const resolver = new Resolver();
    resolver.setServers(['1.1.1.1', '8.8.8.8']);
    const host = new URL(base).hostname;
    for (let i = 0; i < 30; i++) {
      const ok = await resolver.resolve4(host).then((a) => a.length > 0, () => false);
      if (ok) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    // A little extra for the tunnel's edge to start routing.
    await new Promise((r) => setTimeout(r, 3000));
    return await fn(base);
  } finally {
    proc.kill();
  }
}
