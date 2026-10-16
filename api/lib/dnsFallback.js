// The office/home router's DNS sometimes fails to resolve hosts we need
// (Supabase's pooler, new tunnel names) with ENOTFOUND, even though public
// DNS has them. For this process only, when the normal lookup fails with a
// "not found"-type error, retry on Cloudflare and Google public DNS before
// giving up. Imported first in server.js, so database connections and fetch
// calls get it too. It changes nothing on the computer itself.
import dns from 'dns';

const RETRYABLE = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ESERVFAIL', 'ETIMEOUT']);
const resolver = new dns.promises.Resolver({ timeout: 4000, tries: 2 });
resolver.setServers(['1.1.1.1', '8.8.8.8']);

export function withFallback(lookup, resolve4 = (h) => resolver.resolve4(h)) {
  return function lookupWithFallback(hostname, options, callback) {
    if (typeof options === 'function') { callback = options; options = {}; }
    const opts = typeof options === 'number' ? { family: options } : (options || {});
    lookup(hostname, opts, (err, address, family) => {
      if (!err || !RETRYABLE.has(err.code) || opts.family === 6) return callback(err, address, family);
      resolve4(hostname).then(
        (addrs) => {
          if (!addrs?.length) return callback(err);
          if (opts.all) return callback(null, addrs.map((a) => ({ address: a, family: 4 })));
          callback(null, addrs[0], 4);
        },
        () => callback(err),
      );
    });
  };
}

if (!dns.lookup.__publicFallback) {
  const patched = withFallback(dns.lookup.bind(dns));
  patched.__publicFallback = true;
  dns.lookup = patched;
}
