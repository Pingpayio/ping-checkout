// src/services/checkout/checkoutService.js
// Core business logic for checkout sessions (no HTTP, no Express)

import { db } from '../../db/sqlite.js';
import crypto from 'node:crypto';

const SESSION_TTL_HOURS = 2;

/**
 * Create a checkout session
 * @param {Object} input
 * @param {string} input.merchantId
 * @param {Object} input.amount - { assetId: string, amount: string }
 * @param {Object} input.recipient - { address: string, chainId: string }
 * @param {Object} [input.theme] - { brandColor?: string, logoUrl?: string, buttonText?: string }
 * @param {string} [input.successUrl]
 * @param {string} [input.cancelUrl]
 * @param {Object} [input.metadata]
 * @returns {Promise<Object>} CheckoutSession
 */
export async function createCheckoutSession(input) {
  const id = `cs_${crypto.randomUUID()}`;
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_HOURS * 60 * 60 * 1000);

  const stmt = db.prepare(`
    INSERT INTO checkout_sessions (
      id, merchant_id, amount_asset_id, amount_value,
      payer_address, payer_chain_id,
      recipient_address, recipient_chain_id,
      theme_json, success_url, cancel_url,
      status, payment_id, created_at, expires_at, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    input.merchantId,
    input.amount.assetId,
    input.amount.amount,
    null, // payer_address
    null, // payer_chain_id
    input.recipient.address,
    input.recipient.chainId,
    input.theme ? JSON.stringify(input.theme) : null,
    input.successUrl || null,
    input.cancelUrl || null,
    'CREATED',
    null, // payment_id
    now.toISOString(),
    expires.toISOString(),
    input.metadata ? JSON.stringify(input.metadata) : null
  );

  return {
    id,
    merchantId: input.merchantId,
    amount: input.amount,
    recipient: input.recipient,
    theme: input.theme,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    status: 'CREATED',
    paymentId: null,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    metadata: input.metadata
  };
}

/**
 * Get checkout session by ID (scoped to merchant)
 * @param {string} merchantId
 * @param {string} sessionId
 * @returns {Promise<Object|null>} CheckoutSession or null
 */
export async function getCheckoutSessionById(merchantId, sessionId) {
  const stmt = db.prepare(`
    SELECT * FROM checkout_sessions
    WHERE id = ? AND merchant_id = ?
  `);

  const row = stmt.get(sessionId, merchantId);
  if (!row) return null;

  return {
    id: row.id,
    merchantId: row.merchant_id,
    amount: {
      assetId: row.amount_asset_id,
      amount: row.amount_value
    },
    recipient: {
      address: row.recipient_address,
      chainId: row.recipient_chain_id
    },
    theme: row.theme_json ? JSON.parse(row.theme_json) : undefined,
    successUrl: row.success_url || undefined,
    cancelUrl: row.cancel_url || undefined,
    status: row.status,
    paymentId: row.payment_id || null,
    createdAt: row.created_at,
    expiresAt: row.expires_at || undefined,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined
  };
}

