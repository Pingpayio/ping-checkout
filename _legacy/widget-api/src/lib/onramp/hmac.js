// src/lib/onramp/hmac.js
import crypto from "crypto";

export function signState(payload, secret = process.env.PING_HMAC_SECRET) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyState(state, maxAgeMs = 30 * 60 * 1000, secret = process.env.PING_HMAC_SECRET) {
  const [data, sig] = (state || "").split(".");
  if (!data || !sig) throw new Error("invalid_state_format");
  const expect = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  if (sig !== expect) throw new Error("bad_sig");
  const obj = JSON.parse(Buffer.from(data, "base64url").toString());
  if (!obj.ts || Date.now() - obj.ts > maxAgeMs) throw new Error("expired");
  return obj; // { orderId, nonce, ts }
}
