// src/services/intentsClient.js
const BASE = (process.env.NEAR_ONECLICK_BASE || "").replace(/\/+$/, "");
const KEY  = process.env.NEAR_ONECLICK_KEY || "";

// Normalize joins so we never double-slash or misroute
function join(a, b) {
  return `${String(a).replace(/\/+$/, "")}/${String(b).replace(/^\/+/, "")}`;
}

function assertReady() {
  if (!BASE || !KEY) {
    const err = new Error("NEAR 1-Click not configured (NEAR_ONECLICK_BASE / NEAR_ONECLICK_KEY).");
    err.status = 503; // service unavailable/config missing
    throw err;
  }
}

export async function oneClickQuote(payload) {
  assertReady();
  const url = join(BASE, "v0/quote");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = `One-Click /quote failed (${res.status}): ${text}`;
    const err = new Error(msg);
    // Map common cases to cleaner, widget-friendly diagnostics
    if (res.status === 401 || res.status === 403) {
      err.code = "INTENTS_UNAUTHORIZED";
      err.message = "NEAR 1-Click key invalid or unauthorized.";
    } else if (res.status === 404) {
      err.code = "INTENTS_ENDPOINT";
      err.message = "NEAR 1-Click endpoint not found — check NEAR_ONECLICK_BASE (should end with /1click) and path /quote.";
    } else if (res.status === 400) {
      err.code = "QUOTE_SCHEMA_ERROR";
      err.message = `Schema validation failed: ${text}`;
    }
    err.status = res.status;
    throw err;
  }
  return res.json();
}
