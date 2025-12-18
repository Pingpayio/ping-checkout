const BASE = (process.env.NEAR_ONECLICK_BASE || "").replace(/\/+$/, "");
const KEY  = (process.env.NEAR_ONECLICK_KEY || "");

// Optional public feed fallback (no auth)
const TOKENS_FEED_BASE = (process.env.TOKENS_FEED_BASE || "").replace(/\/+$/, "");
const TOKENS_FEED_PATH = process.env.TOKENS_FEED_PATH || "/v0/tokens";

let cachedAt = 0;
let cache = null;
const TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getTokens() {
  const now = Date.now();
  if (cache && (now - cachedAt) < TTL_MS) return cache;
  // Primary: private 1-Click feed (requires auth)
  async function fetchPrivate() {
    if (!BASE) return null;
    const url = `${BASE}/v0/tokens`;
    const res = await fetch(url, {
      headers: KEY ? { "Authorization": `Bearer ${KEY}` } : {}
    });
    if (!res.ok) return null;
    return res.json();
  }

  // Fallback: public feed (no auth)
  async function fetchPublic() {
    if (!TOKENS_FEED_BASE) return null;
    const url = `${TOKENS_FEED_BASE}${TOKENS_FEED_PATH.startsWith('/') ? '' : '/'}${TOKENS_FEED_PATH}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json();
  }

  let data = await fetchPrivate();
  if (!data || (Array.isArray(data) && data.length === 0)) {
    const pub = await fetchPublic();
    if (pub) data = pub;
  }
  if (!data) {
    const err = new Error('Tokens feed unavailable');
    err.status = 503;
    throw err;
  }
  cache = data;
  cachedAt = now;
  return data;
}

export async function getTokenDecimals(assetId) {
  const data = await getTokens();
  const t = (Array.isArray(data) ? data : data.tokens || []).find(t => String(t.assetId) === String(assetId));
  if (!t) {
    const e = new Error(`Unknown assetId for 1Click: ${assetId}`);
    e.status = 400;
    throw e;
  }
  // Try decimals property; fallback to metadata.decimals if provided by API
  return Number.isInteger(t.decimals) ? t.decimals
       : Number.isInteger(t?.metadata?.decimals) ? t.metadata.decimals
       : (() => { const e = new Error(`No decimals for assetId ${assetId}`); e.status=400; throw e; })();
}
