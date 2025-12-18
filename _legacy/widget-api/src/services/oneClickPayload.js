// src/services/oneClickPayload.js

import { getTokenDecimals } from './oneClickTokens.js';
import { toSmallestUnits } from '../lib/amounts.js';

/**
 * Build a NEAR 1-Click /v0/quote payload with the correct schema.
 * Required by API: dry, swapType, slippageTolerance,
 * originAsset, destinationAsset, amount (number string),
 * depositType, refundType, recipientType,
 * recipient, refundTo, deadline (ISO 8601).
 */
export async function buildOneClickQuotePayload(input) {
  const dry = Boolean(input.dryMode ?? false); // default to NON-DRY now
  const swapType = "EXACT_INPUT";
  const slippageTolerance = 100;

  const depositType   = "ORIGIN_CHAIN";
  const refundType    = "ORIGIN_CHAIN";
  const recipientType = "DESTINATION_CHAIN";
  const deadline = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  // Required fields (previously validated)
  if (!input.originAsset)       throw badReq("originAsset is required");
  if (!input.destinationAsset)  throw badReq("destinationAsset is required");
  if (!input.recipient)         throw badReq("recipient is required");
  if (!input.refundTo)          throw badReq("refundTo is required");

  // Convert amount to smallest units using token decimals from API
  let amount;
  if (dry) {
    // For dry runs, use a default amount (1 wNEAR = 1e24 smallest units)
    amount = "1000000000000000000000000";
  } else {
    if (!input.amountCrypto && !input.amountDecimal) {
      throw badReq("amountCrypto or amountDecimal is required when dry=false");
    }
    
    if (input.amountDecimal) {
      // Use human decimal amount and convert to smallest units
      const decimals = await getTokenDecimals(input.originAsset);
      amount = toSmallestUnits(input.amountDecimal, decimals);
    } else {
      // Use provided smallest units amount directly
      amount = input.amountCrypto;
    }
  }

  return {
    dry,
    swapType,
    slippageTolerance,
    originAsset:      input.originAsset,
    destinationAsset: input.destinationAsset,
    amount,                                              // number string in smallest units
    depositType,
    refundType,
    recipientType,
    recipient: input.recipient,
    refundTo:  input.refundTo,
    deadline
  };
}

function badReq(msg) {
  const e = new Error(msg);
  e.status = 400;
  return e;
}
