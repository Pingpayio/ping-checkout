// src/lib/featureFlags.js
export function intentsAvailable() {
  const base = (process.env.NEAR_ONECLICK_BASE || "").trim();
  const key  = (process.env.NEAR_ONECLICK_KEY || "").trim();
  return Boolean(base) && Boolean(key);
}
