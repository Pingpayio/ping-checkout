// src/repos/orders.js
import crypto from "crypto";
import { db } from "../db/sqlite.js";

export function createOrderForQuote(quoteId) {
  // One order per quote; if exists, return it
  const existing = db.prepare(`SELECT * FROM orders WHERE quote_id = ?`).get(quoteId);
  if (existing) return existing.order_id;

  const orderId = "O_" + crypto.randomUUID();
  db.prepare(`
    INSERT INTO orders (order_id, quote_id, status, created_at, updated_at)
    VALUES (?, ?, 'PENDING', datetime('now'), datetime('now'))
  `).run(orderId, quoteId);
  return orderId;
}

export function getOrder(orderId) {
  return db.prepare(`SELECT * FROM orders WHERE order_id = ?`).get(orderId);
}

export function setOrderStatus(orderId, status, txId = null) {
  db.prepare(`
    UPDATE orders SET status = ?, tx_id = COALESCE(?, tx_id), updated_at = datetime('now')
    WHERE order_id = ?
  `).run(status, txId, orderId);
}

export function getOrderWithQuote(orderId){
  return db.prepare(`
    SELECT o.order_id, o.status AS order_status, o.tx_id,
           q.quote_id, q.ext_status_id, q.expires_at
    FROM orders o
    JOIN quotes q ON q.quote_id = o.quote_id
    WHERE o.order_id = ?
  `).get(orderId);
}
