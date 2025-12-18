// src/services/intents/validation.js
// Request validation for intents submit endpoint

/**
 * Validate intents submit request payload
 * @param {Object} body - Request body
 * @returns {Object} Validated and normalized payload
 */
export function validateIntentsSubmitRequest(body) {
  const errors = [];
  
  // Required fields
  if (!body.payLinkId) errors.push('payLinkId is required');
  if (!body.amountSide) errors.push('amountSide is required');
  if (!body.amount) errors.push('amount is required');
  if (!body.sourceAsset) errors.push('sourceAsset is required');
  if (!body.destAsset) errors.push('destAsset is required');
  if (!body.userWallet) errors.push('userWallet is required');

  // Validate amountSide
  if (body.amountSide && !['dest', 'source'].includes(body.amountSide)) {
    errors.push('amountSide must be "dest" or "source"');
  }

  // Validate amount
  if (body.amount && (isNaN(parseFloat(body.amount)) || parseFloat(body.amount) <= 0)) {
    errors.push('amount must be a positive number');
  }

  // Validate asset formats
  if (body.sourceAsset && !isValidAssetId(body.sourceAsset)) {
    errors.push('sourceAsset must be a valid asset ID (e.g., nep141:wrap.near)');
  }
  
  if (body.destAsset && !isValidAssetId(body.destAsset)) {
    errors.push('destAsset must be a valid asset ID (e.g., nep141:wrap.near)');
  }

  // Validate wallet address
  if (body.userWallet && !isValidWalletAddress(body.userWallet)) {
    errors.push('userWallet must be a valid wallet address');
  }

  // Optional fields (non-breaking)
  if (body.fee_bps !== undefined) {
    const n = Number(body.fee_bps);
    if (Number.isNaN(n) || n < 0) errors.push('fee_bps must be a non-negative number if provided');
  }
  if (body.recipient !== undefined && typeof body.recipient !== 'string') {
    errors.push('recipient must be a string if provided');
  }
  if (body.affiliateCode !== undefined && typeof body.affiliateCode !== 'string') {
    errors.push('affiliateCode must be a string if provided');
  }

  if (errors.length > 0) {
    const error = new Error('Validation failed');
    error.status = 400;
    error.code = 'VALIDATION_ERROR';
    error.details = errors;
    throw error;
  }

  // Fix precedence: override/env > req.destAsset|destinationAsset > (no PayLink fallback)
  const fromReq = body.destAsset || body.destinationAsset;
  const fromOverride = process.env.INTENTS_DEST_ASSET_OVERRIDE;
  const destAsset = fromOverride || fromReq;
  
  console.log('[VALIDATION_DEST]', { fromReq, fromOverride, final: destAsset });

  return {
    payLinkId: body.payLinkId,
    amountSide: body.amountSide,
    amount: body.amount,
    sourceAsset: body.sourceAsset,
    destAsset: destAsset,
    userWallet: body.userWallet,
    routeId: body.routeId || null,
    fee_bps: body.fee_bps,
    recipient: body.recipient,
    affiliateCode: body.affiliateCode
  };
}

/**
 * Check if asset ID has valid format
 * @param {string} assetId - Asset identifier
 * @returns {boolean} Is valid format
 */
function isValidAssetId(assetId) {
  if (typeof assetId !== 'string') return false;
  
  // Support various asset formats: nep141:*, eip155:*, solana:*, etc.
  const patterns = [
    /^nep141:[a-zA-Z0-9._-]+$/,  // NEAR fungible tokens
    /^eip155:\d+:[a-fA-F0-9x]+$/, // EVM tokens
    /^solana:[a-zA-Z0-9]+$/,      // Solana tokens
    /^[a-zA-Z0-9._-]+$/          // Simple asset IDs
  ];
  
  return patterns.some(pattern => pattern.test(assetId));
}

/**
 * Check if wallet address has valid format
 * @param {string} address - Wallet address
 * @returns {boolean} Is valid format
 */
function isValidWalletAddress(address) {
  if (typeof address !== 'string') return false;
  
  // Support various wallet address formats
  const patterns = [
    /^[a-zA-Z0-9._-]+$/,           // NEAR accounts
    /^0x[a-fA-F0-9]{40}$/,         // EVM addresses
    /^[1-9A-HJ-NP-Za-km-z]{32,44}$/, // Solana addresses
    /^[a-zA-Z0-9]{26,35}$/         // Bitcoin addresses
  ];
  
  return patterns.some(pattern => pattern.test(address));
}
