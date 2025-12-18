// src/repos/paylinks.js
import { db } from "../db/sqlite.js";
import { validatePayLink, validateProduct, validateAdvancedOptions, validateBranding } from "../schemas/payLink.js";
import { getTokensMeta } from "../services/tokenMeta.js";

/**
 * Create a new pay link
 * @param {Object} payLink - Pay link data
 * @param {string} payLink.id - Unique identifier
 * @param {string} payLink.receiveAssetId - Asset to receive (e.g., "nep141:wrap.near")
 * @param {Object} payLink.product - Product information
 * @param {Object} payLink.advancedOptions - Advanced configuration
 * @param {Object} payLink.branding - Branding configuration
 * @returns {Object} Created pay link
 */
export function createPayLink(payLink) {
  // Validate the pay link data
  const validated = validatePayLink(payLink);
  
  const stmt = db.prepare(`
    INSERT INTO pay_links (id, receive_asset_id, product_json, advanced_options_json, branding_json)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  const result = stmt.run(
    validated.id,
    validated.receiveAssetId,
    JSON.stringify(validated.product),
    JSON.stringify(validated.advancedOptions),
    JSON.stringify(validated.branding)
  );
  
  return {
    id: validated.id,
    receiveAssetId: validated.receiveAssetId,
    product: validated.product,
    advancedOptions: validated.advancedOptions,
    branding: validated.branding,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/**
 * Get a pay link by ID (full data for dashboard)
 * @param {string} id - Pay link ID
 * @returns {Object|null} Pay link data or null if not found
 */
export function getPayLinkById(id) {
  const stmt = db.prepare(`
    SELECT id, receive_asset_id, product_json, advanced_options_json, branding_json, created_at, updated_at
    FROM pay_links WHERE id = ?
  `);
  
  const row = stmt.get(id);
  if (!row) return null;
  
  try {
    return {
      id: row.id,
      receiveAssetId: row.receive_asset_id,
      product: validateProduct(JSON.parse(row.product_json)),
      advancedOptions: validateAdvancedOptions(JSON.parse(row.advanced_options_json)),
      branding: validateBranding(JSON.parse(row.branding_json)),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  } catch (error) {
    console.error(`[paylinks] Invalid JSON data for pay link ${id}:`, error.message);
    return null;
  }
}

/**
 * Get merchant payout address for a pay link on a specific chain
 * Looks in advancedOptions.merchantPayouts[chain] then advancedOptions.merchantPayout
 * @param {string} payLinkId
 * @param {string} chain - e.g., "near", "base"
 * @returns {string|null}
 */
export function getPayoutAddress(payLinkId, chain) {
  const link = getPayLinkById(payLinkId);
  if (!link) return null;
  const ao = link.advancedOptions || {};
  const payouts = ao.merchantPayouts || {};
  if (chain && payouts && typeof payouts === 'object' && payouts[chain]) {
    return payouts[chain];
  }
  return ao.merchantPayout || null;
}

/**
 * Update a pay link
 * @param {string} id - Pay link ID
 * @param {Object} updates - Fields to update
 * @returns {Object|null} Updated pay link or null if not found
 */
export function updatePayLink(id, updates) {
  const existing = getPayLinkById(id);
  if (!existing) return null;
  
  // Validate updates
  const validatedUpdates = {};
  if (updates.receiveAssetId) {
    validatedUpdates.receiveAssetId = String(updates.receiveAssetId).trim();
  }
  if (updates.product) {
    validatedUpdates.product = validateProduct(updates.product);
  }
  if (updates.advancedOptions) {
    validatedUpdates.advancedOptions = validateAdvancedOptions(updates.advancedOptions);
  }
  if (updates.branding) {
    validatedUpdates.branding = validateBranding(updates.branding);
  }
  
  const updated = {
    ...existing,
    ...validatedUpdates,
    updatedAt: new Date().toISOString()
  };
  
  const stmt = db.prepare(`
    UPDATE pay_links 
    SET receive_asset_id = ?, product_json = ?, advanced_options_json = ?, branding_json = ?, updated_at = ?
    WHERE id = ?
  `);
  
  stmt.run(
    updated.receiveAssetId,
    JSON.stringify(updated.product),
    JSON.stringify(updated.advancedOptions),
    JSON.stringify(updated.branding),
    updated.updatedAt,
    id
  );
  
  return updated;
}

/**
 * List all pay links (for dashboard)
 * @param {Object} options - Query options
 * @param {number} options.limit - Maximum number of results
 * @param {number} options.offset - Number of results to skip
 * @returns {Array} Array of pay links
 */
export function listPayLinks(options = {}) {
  const { limit = 50, offset = 0 } = options;
  
  const stmt = db.prepare(`
    SELECT id, receive_asset_id, product_json, advanced_options_json, branding_json, created_at, updated_at
    FROM pay_links 
    ORDER BY created_at DESC 
    LIMIT ? OFFSET ?
  `);
  
  const rows = stmt.all(limit, offset);
  
  return rows.map(row => {
    try {
      return {
        id: row.id,
        receiveAssetId: row.receive_asset_id,
        product: validateProduct(JSON.parse(row.product_json)),
        advancedOptions: validateAdvancedOptions(JSON.parse(row.advanced_options_json)),
        branding: validateBranding(JSON.parse(row.branding_json)),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (error) {
      console.error(`[paylinks] Invalid JSON data for pay link ${row.id}:`, error.message);
      return null;
    }
  }).filter(Boolean);
}

/**
 * Get pay link configuration for widget bootstrap (minimal, readonly)
 * @param {string} id - Pay link ID
 * @returns {Object|null} Widget configuration or null if not found
 */
export async function getPayLinkConfig(id) {
  const payLink = getPayLinkById(id);
  if (!payLink) return null;
  
  // Collect all assets that need metadata
  const assets = new Set([
    payLink.receiveAssetId,
    // Add any selectable pay assets if supported
    ...(payLink.advancedOptions?.availablePayAssets || []),
    // Add gating assets
    ...(payLink.advancedOptions?.gating?.assets?.map(a => a.id) || [])
  ]);
  
  // Resolve token metadata
  const tokens = await getTokensMeta(Array.from(assets), payLink.chainId || 'near:mainnet');
  
  // Return minimal configuration for widget
  return {
    id: payLink.id,
    receiveAssetId: payLink.receiveAssetId,
    chainId: payLink.chainId || 'near:mainnet',
    product: payLink.product,
    gating: payLink.advancedOptions.gating || {},
    discounts: payLink.advancedOptions.discounts || {},
    payments: payLink.advancedOptions.payments || {},
    onramp: payLink.advancedOptions.onramp || {},
    branding: payLink.branding,
    tokens,
    preview: {
      userWallet: process.env.INTENTS_PREVIEW_REFUND || 'eclipse_eve5628.near'
    }
  };
}

/**
 * Delete a pay link
 * @param {string} id - Pay link ID
 * @returns {boolean} True if deleted, false if not found
 */
export function deletePayLink(id) {
  const stmt = db.prepare(`DELETE FROM pay_links WHERE id = ?`);
  const result = stmt.run(id);
  return result.changes > 0;
}