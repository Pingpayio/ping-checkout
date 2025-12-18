// src/repos/quotes.js
import { db } from "../db/sqlite.js";

export function insertQuote(row) {
  db.prepare(`
    INSERT OR REPLACE INTO quotes
    (quote_id, pay_link_id, origin_asset, destination_asset, amount, chain_id, expires_at, status, ext_status_id, recipient, refund_to, created_at, updated_at)
    VALUES (@quote_id, @pay_link_id, @origin_asset, @destination_asset, @amount, @chain_id, @expires_at, @status, @ext_status_id, @recipient, @refund_to,
            datetime('now'), datetime('now'))
  `).run(row);
}

export function getQuote(quoteId) {
  return db.prepare(`SELECT * FROM quotes WHERE quote_id = ?`).get(quoteId);
}

export function setQuoteExtStatusId(quoteId, extId) {
  db.prepare(`
    UPDATE quotes SET ext_status_id = ?, updated_at = datetime('now')
    WHERE quote_id = ?
  `).run(extId, quoteId);
}
