// src/lib/webhooks.js
import crypto from "crypto";

export function verifyHmacBase64(rawBody, headerSig, secret) {
  if (!secret) return false;
  if (!headerSig) return false;
  const mac = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  // timing-safe compare
  const a = Buffer.from(mac);
  const b = Buffer.from(headerSig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function sha256Base64(rawBody) {
  return crypto.createHash("sha256").update(rawBody).digest("base64");
}
