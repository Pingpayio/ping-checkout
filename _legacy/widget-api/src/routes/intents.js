// src/routes/intents.js
// Intents router - separate namespace from on-ramp

import express from 'express';
import axios from 'axios';
import { processIntentsSubmit } from '../services/intents/index.js';
import { submitIntentsQuote, getIntentsStatus } from '../services/intents/client.js';
import { getPayoutAddress } from '../repos/paylinks.js';

const intentsRouter = express.Router();

// Fetch Core config by payLinkId
async function fetchCoreConfig(payLinkId) {
  try {
    const coreUrl = process.env.CORE_API_BASE || 'http://localhost:8080';
    const response = await axios.get(`${coreUrl}/api/v1/pay-links/${payLinkId}/config`, {
      headers: {
        'x-publishable-key': 'pk_test_staging'
      },
      timeout: 5000
    });
    
    console.log('[CORE_CONFIG_FETCH]', { payLinkId, status: response.status, hasData: !!response.data });
    return response.data;
  } catch (error) {
    console.error('[CORE_CONFIG_ERROR]', { payLinkId, status: error.response?.status, message: error.message });
    throw error;
  }
}

// Make GET loud so no one accidentally uses it
intentsRouter.get('/quote', (_req, res) =>
  res.status(405).json({ success: false, error: 'METHOD_NOT_ALLOWED', message: 'Use POST for quotes' })
);

// POST /api/v1/intents/quote - Get quote for intents
intentsRouter.post('/quote', express.json({ limit: '1mb' }), async (req, res) => {
  // Prevent stale caches on quote responses
  res.set('Cache-Control', 'no-store');
  
  // 1. Mark the request at the very top
  const reqId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  console.info('[QUOTE_ENTER]', { reqId, ip: req.ip, path: req.originalUrl, hasBody: !!req.body });
  
  // Request coordination logging for frontend discipline
  const { userWallet } = req.body || {};
  const isPreview = !userWallet;
  const quoteType = isPreview ? 'PREVIEW' : 'CONNECTED';
  const timestamp = new Date().toISOString();
  
  console.log(`[${quoteType}_REQUEST] ${timestamp} - ${req.ip} - ${userWallet || 'no-wallet'}`);
  
  // Debug logging
  console.info('[QUOTE_ENTER] content-type:', req.get('content-type'));
  console.info('[QUOTE_ENTER] body keys:', Object.keys(req.body || {}));
  console.log('[RUNTIME_PROOF_ROUTER] Quote route called with body:', JSON.stringify(req.body, null, 2));
  console.log('[RUNTIME_PROOF_ROUTER] Environment check:', {
    INTENTS_DEST_ASSET_OVERRIDE: process.env.INTENTS_DEST_ASSET_OVERRIDE,
    INTENTS_PREVIEW_RECIPIENT: process.env.INTENTS_PREVIEW_RECIPIENT,
    INTENTS_PREVIEW_REFUND: process.env.INTENTS_PREVIEW_REFUND
  });
  
  try {
    // Extract early
    const { payLinkId, amount, amountSide, userWallet } = req.body || {};
    const { fee_bps, recipient, affiliateCode, slippageBps } = req.body || {};
    
    // Task 3a: Assert required fields and log the miss
    const {
      swapType, originAsset, destinationAsset,
      amount: amountField, amountSide: amountSideField, userWallet: userWalletField, dry
    } = req.body || {};

    console.info('[QUOTE_REQ]', {
      hasSwapType: !!swapType,
      hasOrigin: !!originAsset,
      hasDest: !!destinationAsset,
      hasAmount: !!amountField,
      hasAmountSide: !!amountSideField,
      hasWallet: !!userWalletField,
      dry
    });

    if (swapType !== 'EXACT_OUTPUT' ||
        !originAsset || !destinationAsset || !amountField || amountSideField !== 'dest') {
      console.error('[QUOTE_EARLY_400]', JSON.stringify({
        reqId,
        reason: 'VALIDATION',
        bodyKeys: Object.keys(req.body || {}),
        snapshot: req.body,
      }));
      return res.status(400).json({ 
        success: false,
        error: 'INVALID_PARAMS',
        message: 'swapType, originAsset, destinationAsset, amount, amountSide=dest are required' 
      });
    }

    // Log the provider payload you send
    console.info('[PROVIDER_OUT]', {
      swapType, originAsset, destinationAsset, amount: amountField, dry,
      recipientType: req.body.recipientType, refundType: req.body.refundType
    });
    
    // 1) Strict NEAR asset check
    const isNearId = (id) => !!id && /^(nep141:|nep245:)/i.test(id);

    // Log & block any alias (e.g., 'usdc.base') immediately
    if (!isNearId(originAsset) || !isNearId(destinationAsset)) {
      console.error('[QUOTE_EARLY_400]', JSON.stringify({
        reqId,
        reason: 'ALIAS_LEAK',
        bodyKeys: Object.keys(req.body || {}),
        snapshot: req.body,
      }));
      console.error('[ALIAS_LEAK]', {
        from: req.headers['x-forwarded-for'] || req.ip,
        url: req.originalUrl,
        raw: { originAsset, destinationAsset, amount: amountField, amountSide: amountSideField, userWallet: userWalletField, payLinkId }
      });
      return res.status(400).json({
        success: false,
        error: 'INVALID_PARAMS',
        message: 'Assets must be canonical NEAR ids (nep141:/nep245:). Alias detected.',
        details: { originAsset, destinationAsset }
      });
    }
    
    // 2) Preflight validation (strict, cheap)
    if (!payLinkId) {
      console.error('[QUOTE_EARLY_400]', JSON.stringify({
        reqId,
        reason: 'MISSING_PAYLINK',
        bodyKeys: Object.keys(req.body || {}),
        snapshot: req.body,
      }));
      return bad(400, 'INVALID_PARAMS', 'Missing payLinkId');
    }

    // Task B2: Fetch Core config and enforce settlement BEFORE other validations
    let coreConfig;
    try {
      coreConfig = await fetchCoreConfig(payLinkId);
      if (!coreConfig?.recipientAccount || !coreConfig?.receiveAssetId) {
        console.error('[CORE_CONFIG_INCOMPLETE]', { payLinkId, config: coreConfig });
        return res.status(503).json({ 
          success: false,
          error: 'CONFIG_INCOMPLETE', 
          message: 'recipientAccount/receiveAssetId missing' 
        });
      }
    } catch (error) {
      console.error('[CORE_CONFIG_FETCH_FAILED]', { payLinkId, error: error.message });
      return res.status(503).json({ 
        success: false,
        error: 'SERVICE_UNAVAILABLE', 
        message: 'Unable to fetch pay link configuration' 
      });
    }

    // Strip client settlement; inject server values
    const body = { ...req.body };
    delete body.recipient; 
    delete body.recipientType;
    delete body.refundTo;  
    delete body.refundType;
    
    // Enforce server-controlled settlement
    body.recipientType = 'DESTINATION_CHAIN';
    body.recipient = coreConfig.recipientAccount;   // e.g. 'nicemask8205.near'
    body.refundType = 'ORIGIN_CHAIN';
    body.refundTo = body.userWallet;               // payer
    body.destinationAsset = coreConfig.receiveAssetId; // canonical USDC
    
    console.log('[SETTLEMENT_ENFORCED]', { 
      payLinkId, 
      recipient: body.recipient, 
      refundTo: body.refundTo,
      destAsset: body.destinationAsset
    });
    if (!/^\d+$/.test(String(body.amount))) {
      console.error('[QUOTE_EARLY_400]', JSON.stringify({
        reqId,
        reason: 'INVALID_AMOUNT',
        bodyKeys: Object.keys(body || {}),
        snapshot: body,
      }));
      return bad(400, 'INVALID_PARAMS', 'Invalid amount');
    }
    if (body.amountSide !== 'dest') {
      console.error('[QUOTE_EARLY_400]', JSON.stringify({
        reqId,
        reason: 'INVALID_AMOUNT_SIDE',
        bodyKeys: Object.keys(body || {}),
        snapshot: body,
      }));
      return bad(400, 'INVALID_PARAMS', 'amountSide must be dest');
    }

    const isPreview = !userWallet; // Preview when no userWallet provided

    // 2) Build provider payload with enforced settlement
    const providerPayload = {
      amount: String(body.amount),
      swapType: 'EXACT_OUTPUT',
      originAsset: body.originAsset,
      destinationAsset: body.destinationAsset, // From Core config
      ...(isPreview ? { dry: true } : {}),

      slippageTolerance: slippageBps ?? 100,
      quoteWaitingTimeMs: 3000,

      // Use enforced settlement values
      recipientType: body.recipientType,
      recipient: body.recipient,
      refundType: body.refundType,
      refundTo: body.refundTo,

      depositMode: 'SIMPLE',
      depositType: 'INTENTS',
      referral: process.env.INTENTS_REFERRAL?.toLowerCase(),
      sessionId: req.headers['x-session-id'] || undefined,
    };

    console.log('[QUOTE_ROUTE] Calling submitIntentsQuote with:', {
      swapType: 'EXACT_OUTPUT',
      amount,
      originAsset: originAsset,
      destinationAsset: destinationAsset,
      dry: isPreview
    });

    // 3. Around axios call (ensure we always log provider)
    console.info('[PROVIDER_OUT]', JSON.stringify({ 
      reqId, 
      url: 'https://1click.chaindefuser.com/v0/quote', 
      swapType: providerPayload.swapType, 
      originAsset: providerPayload.originAsset, 
      destinationAsset: providerPayload.destinationAsset, 
      amount: providerPayload.amount, 
      dry: !!providerPayload.dry 
    }));

    const result = await submitIntentsQuote(providerPayload);

    // Connected quotes (with deposit/routeId) should return explicit settlement data
    if (result && result.success && result.data && result.data.deposit) {
      const settlementResponse = {
        success: true,
        data: {
          routeId: result.data.routeId,
          deposit: { 
            address: result.data.deposit.address, 
            asset: body.originAsset, 
            chain: 'near',
            amount: result.data.deposit.amount
          },
          recipient: body.recipient,
          refundTo: body.refundTo,
          total: result.data.total,
          amountIn: result.data.amountIn || result.data.minAmountIn,
          destAsset: body.destinationAsset,
          expiresAt: result.data.expiresAt
        }
      };
      console.log('[CONNECTED_QUOTE]', settlementResponse.data);
      console.log(`[CONNECTED_SUCCESS] ${timestamp} - ${userWallet} - routeId: ${result.data.routeId}`);
      return res.json(settlementResponse);
    }

    // Preview quotes (dry, no deposit) should return the UI-mapped response
    if (result && result.success && result.data && result.data.total) {
      const mapped = {
        success: true,
        data: {
          total: result.data.total,     // amountOut from quote
          amount: result.data.amount,   // optional mirror
          destAsset: destinationAsset,         // canonical NEAR-USDC
          sourceAsset: originAsset,
          estimatedTime: '2-5 minutes',
          expiresAt: result.data.expiresAt
        }
      };
      console.log('[UI_QUOTE_MAP]', mapped);
      console.log(`[PREVIEW_SUCCESS] ${timestamp} - no-wallet - total: ${result.data.total}`);
      return res.json(mapped);
    }

    return res.json(result);

  } catch (e) {
    // Axios vs non-axios safety
    const status  = e?.response?.status ?? 500;
    const pdata   = e?.response?.data ?? null;
    const pmsg    = pdata?.message || e?.message || 'PROVIDER_ERROR';
    const pcode   = e?.code || null;
    const purl    = e?.config?.url || null;
    const pmeth   = e?.config?.method || null;

    // 🔴 Force a single line with everything we need
    console.error('[PROVIDER_STATUS]', JSON.stringify({
      status, pmsg, pcode, purl, pmeth, providerBody: pdata
    }));

    return res.status(status).json({
      success: false,
      error: 'PROVIDER_ERROR',
      message: pmsg,
      details: pdata || { code: pcode, url: purl, method: pmeth }
    });
  }

  function bad(status, error, message) {
    return res.status(status).json({ success: false, error, message });
  }
});

// POST /api/v1/intents/submit - Submit intents transaction
intentsRouter.post('/submit', async (req, res) => {
  try {
    console.log('[intents] Submit request received:', {
      payLinkId: req.body?.payLinkId,
      amountSide: req.body?.amountSide,
      amount: req.body?.amount,
      originAsset: req.body?.originAsset,
      destinationAsset: req.body?.destinationAsset,
      userWallet: req.body?.userWallet,
      fee_bps: req.body?.fee_bps,
      recipient: req.body?.recipient,
      affiliateCode: req.body?.affiliateCode
    });

    const result = await processIntentsSubmit(req.body);
    
    console.log('[intents] Submit successful:', {
      routeId: result.data.routeId,
      depositChain: result.data.deposit.chain,
      depositAmount: result.data.deposit.amount
    });

    res.json(result);

  } catch (error) {
    console.error('[intents] Submit failed:', {
      error: error.message,
      code: error.code,
      status: error.status
    });

    if (error.status && error.code) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
        details: error.details
      });
    }

    // Handle provider errors
    if (error.message.includes('PROVIDER_ERROR')) {
      return res.status(502).json({
        success: false,
        error: 'PROVIDER_ERROR',
        message: error.message.replace('PROVIDER_ERROR: ', '')
      });
    }

    // Generic error
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Internal server error'
    });
  }
});

// GET /api/v1/intents/status - Get status of intents transaction
intentsRouter.get('/status', async (req, res) => {
  // Prevent stale caches on status responses
  res.set('Cache-Control', 'no-store');
  res.set('Content-Type', 'application/json');

  const { routeId } = req.query;

  // Log request
  console.log('[STATUS_REQ]', `routeId=${routeId}`);

  // Validate routeId (400 if missing)
  if (!routeId) {
    return res.status(400).json({
      success: false,
      error: 'MISSING_PARAMETERS',
      message: 'routeId is required'
    });
  }

  try {
    // Call the intents status service
    const result = await getIntentsStatus({ routeId });

    // Map upstream states to the 3 values: pending | completed | failed
    const status = result?.status ?? 'pending';
    const txId = result?.txId ?? null;
    const reason = result?.reason ?? null;

    // Build response based on status
    let response;
    if (status === 'completed') {
      response = { status: 'completed', txId };
    } else if (status === 'failed') {
      response = { status: 'failed', reason };
    } else {
      // Default to pending for any other state
      response = { status: 'pending' };
    }

    // Log response
    console.log('[STATUS_OUT]', response);

    return res.json(response);
  } catch (err) {
    // On upstream errors, return { "status":"pending" } with 200 (not 5xx)
    console.error('[STATUS_ERROR]', err.message);
    const response = { status: 'pending' };
    console.log('[STATUS_OUT]', response);
    return res.json(response);
  }
});


export default intentsRouter;
