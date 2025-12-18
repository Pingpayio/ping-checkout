// src/services/intentsStatus.js
const BASE = (process.env.NEAR_ONECLICK_BASE || "").replace(/\/+$/, "");
const KEY  = (process.env.NEAR_ONECLICK_KEY || "");

function join(a,b){ return `${String(a).replace(/\/+$/,"")}/${String(b).replace(/^\/+/,"")}`; }

export async function oneClickStatus(params) {
  const url = new URL(join(BASE, "v0/status"));
  // Accept multiple potential parameter names. Pick first that exists.
  const idKey = params.requestId ? "requestId"
             : params.statusId  ? "statusId"
             : params.id        ? "id"
             : "requestId";
  url.searchParams.set(idKey, params[idKey] || params.requestId || params.statusId || params.id);

  const res = await fetch(url.toString(), {
    headers: { "Authorization": `Bearer ${KEY}` }
  });
  if (!res.ok) {
    const text = await res.text().catch(()=> "");
    const err = new Error(`One-Click /status failed (${res.status}): ${text}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}
