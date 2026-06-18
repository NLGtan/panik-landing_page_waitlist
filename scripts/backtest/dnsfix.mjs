/**
 * DNS workaround preload. The local network's system DNS resolver is dead
 * (getaddrinfo → ENOTFOUND for every host) but Cloudflare/Google DNS are
 * reachable by IP. We route Node's dns.lookup through c-ares against 1.1.1.1,
 * so fetch/undici/viem resolve normally. Load with: node --import ./dnsfix.mjs
 *
 * Pure in-process; touches no system config.
 */
import dns from "node:dns";

dns.setServers(["1.1.1.1", "8.8.8.8"]);

const resolve4 = (h) => new Promise((ok) => dns.resolve4(h, (e, a) => ok(e ? [] : a)));
const resolve6 = (h) => new Promise((ok) => dns.resolve6(h, (e, a) => ok(e ? [] : a)));

async function caresLookup(hostname, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }
  const opts = options || {};
  const v4 = await resolve4(hostname);
  const v6 = opts.family === 6 || v4.length === 0 ? await resolve6(hostname) : [];
  if (opts.all) {
    const all = [
      ...v4.map((address) => ({ address, family: 4 })),
      ...v6.map((address) => ({ address, family: 6 })),
    ];
    if (all.length) return callback(null, all);
    return callback(Object.assign(new Error(`ENOTFOUND ${hostname}`), { code: "ENOTFOUND" }));
  }
  if (opts.family === 6 && v6.length) return callback(null, v6[0], 6);
  if (v4.length) return callback(null, v4[0], 4);
  if (v6.length) return callback(null, v6[0], 6);
  return callback(Object.assign(new Error(`ENOTFOUND ${hostname}`), { code: "ENOTFOUND" }));
}

dns.lookup = caresLookup;
dns.promises.lookup = (hostname, options = {}) =>
  new Promise((resolve, reject) =>
    caresLookup(hostname, options, (err, address, family) =>
      err ? reject(err) : resolve(options.all ? address : { address, family }),
    ),
  );
