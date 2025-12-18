// src/schemas/quoteInput.js

/**
 * Normalize widget request into builder input.
 * Expect the widget (or your FE) to pass:
 * {
 *   payLinkId,
 *   chainId,                 // "near:testnet"
 *   payAssetId,              // becomes originAsset
 *   receiveAssetId,          // becomes destinationAsset
 *   recipient,               // merchant address (from pay link config)
 *   payerAddress,            // user's wallet address (refundTo)
 *   amountCrypto,            // string: user's input amount in crypto units
 *   dryMode                  // boolean (optional) defaults to true until key & pricing live
 * }
 */
export function parseQuoteInput(body = {}) {
  const {
    payLinkId, chainId,
    payAssetId, receiveAssetId,
    recipient, payerAddress,
    amountCrypto,           // smallest units (optional)
    amountDecimal,          // human decimal (preferred by FE)
    dryMode,
    swapType, slippageTolerance, depositType, refundType, recipientType, deadline
  } = body || {};

  const errors = [];
  if (!payLinkId)      errors.push("payLinkId is required");
  if (!chainId)        errors.push("chainId is required");
  if (!payAssetId)     errors.push("payAssetId (originAsset) is required");
  if (!receiveAssetId) errors.push("receiveAssetId (destinationAsset) is required");
  
  // Always require recipient (merchant address)
  if (!recipient) {
    const err = new Error("Merchant recipient address required.");
    err.status = 400;
    err.code = "MISSING_RECIPIENT";
    throw err;
  }
  
  // Always require payerAddress (refundTo)
  if (!payerAddress) {
    const err = new Error("Payer address required.");
    err.status = 400;
    err.code = "MISSING_REFUND_TO";
    throw err;
  }

  const isDry = (typeof dryMode === "boolean") ? dryMode : true;
  if (!isDry) {
    if (!amountCrypto && !amountDecimal) errors.push("amountDecimal or amountCrypto is required when dry=false");
  }
  if (errors.length) { const err = new Error(errors.join("; ")); err.status = 400; throw err; }

  return {
    payLinkId, chainId,
    originAsset:      String(payAssetId).trim(),
    destinationAsset: String(receiveAssetId).trim(),
    recipient,
    refundTo:     payerAddress || recipient,
    amountCrypto: amountCrypto || (isDry ? "1" : null),
    amountDecimal: amountDecimal || null,
    dryMode:      isDry,
    swapType, slippageTolerance, depositType, refundType, recipientType, deadline
  };
}
