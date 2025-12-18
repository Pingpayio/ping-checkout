// src/repos/allowlist.js
import { db } from "../db/sqlite.js";

export function getAllowlistWallets(payLinkId) {
  return db.prepare(
    `SELECT wallet FROM pay_link_allowlist WHERE pay_link_id = ?`
  ).all(payLinkId).map(r => r.wallet);
}
