// src/services/intentsExecute.js
const BASE = (process.env.NEAR_ONECLICK_BASE || "").replace(/\/+$/, "");
const KEY  = (process.env.NEAR_ONECLICK_KEY || "");

function join(a,b){ return `${String(a).replace(/\/+$/,"")}/${String(b).replace(/^\/+/,"")}`; }

export async function oneClickExecute(payload) {
  // Try different possible execute endpoints
  const possibleEndpoints = ["v0/execute", "v0/intents", "v0/create", "execute"];
  
  for (const endpoint of possibleEndpoints) {
    try {
      const url = join(BASE, endpoint);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        return res.json();
      }
      
      // If 404, try next endpoint
      if (res.status === 404) {
        continue;
      }
      
      // For other errors, throw immediately
      const text = await res.text().catch(() => "");
      const err = new Error(`One-Click /${endpoint} failed (${res.status}): ${text}`);
      err.status = res.status;
      throw err;
    } catch (e) {
      if (e.status === 404) continue;
      throw e;
    }
  }
  
  // If all endpoints failed with 404
  const err = new Error("No valid execute endpoint found. Tried: " + possibleEndpoints.join(", "));
  err.status = 404;
  throw err;
}
