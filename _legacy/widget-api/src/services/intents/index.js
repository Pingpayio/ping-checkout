// src/services/intents/index.js
// Main intents service orchestrator

import { validateIntentsSubmitRequest } from './validation.js';
import { convertAmountToSmallestUnits } from './amounts.js';
import { submitIntentsQuote } from './client.js';
import { getPayLinkById } from '../../repos/paylinks.js';
import crypto from 'crypto';

/**
 * Process intents submit request
 * @param {Object} requestBody - Raw request body
 * @returns {Promise<Object>} Normalized response
 */
export async function processIntentsSubmit(requestBody) {
  console.log('[intents] Processing submit request:', {
    payLinkId: requestBody.payLinkId,
    amountSide: requestBody.amountSide,
    amount: requestBody.amount,
    sourceAsset: requestBody.sourceAsset,
    destAsset: requestBody.destAsset,
    userWallet: requestBody.userWallet
  });

  // 1. Validate request
  const validated = validateIntentsSubmitRequest(requestBody);
  
  // 2. Convert amount to smallest units
  const amountInSmallestUnits = await convertAmountToSmallestUnits(
    validated.amount, 
    validated.amountSide === 'dest' ? validated.destAsset : validated.sourceAsset
  );

  // 3. Determine swap type
  const swapType = validated.amountSide === 'dest' ? 'EXACT_OUTPUT' : 'EXACT_INPUT';

  // 4. Get PayLink to extract merchant payout address
  const payLink = getPayLinkById(validated.payLinkId);
  if (!payLink) {
    const e = new Error(`PayLink not found: ${validated.payLinkId}`);
    e.status = 404;
    e.code = "PAYLINK_NOT_FOUND";
    throw e;
  }

  // Extract merchant payout address for destination chain
  const destChain = 'near'; // Extract from destAsset if needed
  const merchantPayout = payLink.advancedOptions?.merchantPayouts?.[destChain] || 
                        payLink.advancedOptions?.merchantPayout || 
                        'merchant.testnet';

  // 5. Generate deadline (30 minutes from now)
  const deadline = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  // 6. Prepare 1Click API payload with all required fields
  const quoteParams = {
    swapType,
    amount: amountInSmallestUnits,
    originAsset: validated.sourceAsset,
    destinationAsset: validated.destAsset,
    depositType: 'ORIGIN_CHAIN',
    recipientType: 'DESTINATION_CHAIN',
    recipient: merchantPayout,
    refundType: 'ORIGIN_CHAIN',
    refundTo: validated.userWallet,
    deadline,
    slippageTolerance: Number(process.env.INTENTS_SLIPPAGE_BPS || '50'), // 50 bps = 0.50%
    // Optional fee passthrough
    fee_bps: requestBody.fee_bps,
    feeRecipient: requestBody.recipient,
    // Mark dry=false in submit flow explicitly
    dry: false
  };

  console.log('[intents] Submitting to 1Click:', {
    swapType: quoteParams.swapType,
    amount: quoteParams.amount,
    originAsset: quoteParams.originAsset,
    destinationAsset: quoteParams.destinationAsset
  });

  // 7. Affiliate tracking (optional)
  const affiliateCode = requestBody.affiliateCode;
  let affiliateRef;
  if (affiliateCode) {
    const salt = process.env.AFFILIATE_SALT || '';
    const raw = `${validated.payLinkId}:${affiliateCode}:${Date.now()}:${salt}`;
    affiliateRef = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
  }

  // 8. Call 1Click API
  const result = await submitIntentsQuote(quoteParams);

  console.log('[intents] Submit successful:', {
    routeId: result.data.routeId,
    depositChain: result.data.deposit.chain,
    depositAmount: result.data.deposit.amount
  });

  // 9. TODO: persist route metadata in orders/quotes repo if available
  // Example (pseudo): upsertRoute({ routeId: result.data.routeId, affiliateCode, affiliateRef, fee_bps: requestBody.fee_bps, recipient: requestBody.recipient })

  return result;
}
