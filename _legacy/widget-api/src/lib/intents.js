// src/lib/intents.js
export function intentsConfig() {
  // Use your existing env var names:
  const rawBase = process.env.NEAR_ONECLICK_BASE || "";
  const key = process.env.NEAR_ONECLICK_KEY || "";
  const env = process.env.INTENTS_ENV || "testnet"; // optional, if you set it

  // Normalize base (avoid trailing slash to make route joins stable)
  const baseUrl = rawBase.replace(/\/+$/, "");
  const ready = Boolean(baseUrl) && Boolean(key);

  return {
    ready,
    baseUrl,
    env,
    // never return key or webhook secret
  };
}
