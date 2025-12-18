// src/services/intents/client.js
// Intents API client for 1Click integration (separate from on-ramp)

import axios from 'axios';

const NEAR_ONECLICK_BASE = process.env.NEAR_ONECLICK_BASE || 'https://1click.chaindefuser.com';
const INTENTS_QUOTE_PATH = process.env.INTENTS_QUOTE_PATH || '/v0/quote';
const NEAR_ONECLICK_KEY = process.env.NEAR_ONECLICK_KEY;
const INTENTS_SLIPPAGE_BPS = Number(process.env.INTENTS_SLIPPAGE_BPS || '100'); // 1% default

// Debug flag for URL construction logging
const DEBUG_INTENTS_URL = process.env.DEBUG_INTENTS_URL === 'true';

// Log environment variables at startup
if (DEBUG_INTENTS_URL) {
  console.log('[INTENTS_ENV]', {
    NEAR_ONECLICK_BASE: process.env.NEAR_ONECLICK_BASE,
    INTENTS_QUOTE_PATH: process.env.INTENTS_QUOTE_PATH,
    hasKey: !!process.env.NEAR_ONECLICK_KEY
  });
}

/**
 * Submit intents quote to 1Click API
 * @param {Object} params - Quote parameters
 * @returns {Promise<Object>} Normalized response
 */
export async function submitIntentsQuote(params) {
  // RUNTIME PROOF: This is the actual code being executed at runtime
  console.log('[RUNTIME_PROOF] submitIntentsQuote called with params:', JSON.stringify(params, null, 2));
  console.log('[RUNTIME_PROOF] Environment variables:', {
    INTENTS_DEST_ASSET_OVERRIDE: process.env.INTENTS_DEST_ASSET_OVERRIDE,
    INTENTS_PREVIEW_RECIPIENT: process.env.INTENTS_PREVIEW_RECIPIENT,
    INTENTS_PREVIEW_REFUND: process.env.INTENTS_PREVIEW_REFUND,
    NEAR_ONECLICK_KEY: process.env.NEAR_ONECLICK_KEY ? 'SET' : 'NOT_SET'
  });
  
  if (!NEAR_ONECLICK_KEY) {
    throw new Error('NEAR_ONECLICK_KEY not configured');
  }

  // Normalize URL construction to avoid double segments
  const base = (process.env.NEAR_ONECLICK_BASE || '').replace(/\/$/, '');
  const path = (process.env.INTENTS_QUOTE_PATH || '/v0/quote');
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  
         if (DEBUG_INTENTS_URL) {
           console.log('[INTENTS_URL_JOIN]', { base, path, url });
         }
         
         console.log('[INTENTS_URL_JOIN]', url);      // -> https://1click.chaindefuser.com/v0/quote
         console.log('[INTENTS_AUTH]', !!process.env.NEAR_ONECLICK_KEY ? 'set' : 'missing');
  
  console.log('[intents] Submitting quote to 1Click:', {
    url,
    base: NEAR_ONECLICK_BASE,
    path: INTENTS_QUOTE_PATH,
    envBase: process.env.NEAR_ONECLICK_BASE,
    envPath: process.env.INTENTS_QUOTE_PATH,
    swapType: params.swapType,
    amount: params.amount,
    originAsset: params.originAsset,
    destinationAsset: params.destinationAsset
  });

         try {
           // Build request body with strict separation between dry (quote) and submit payloads
           let body;
           const slippage = Number(params.slippageTolerance ?? INTENTS_SLIPPAGE_BPS);
           
          if (params.dry === true) {
            // before building body, derive preview recipients once
            const previewRecipient = params.recipient ?? process.env.INTENTS_PREVIEW_RECIPIENT;
            const previewRefund    = params.refundTo  ?? process.env.INTENTS_PREVIEW_REFUND;

            // (optional) hard guard so we fail fast with a clear message if envs are missing
            if (!previewRecipient || !previewRefund) {
              throw new Error('INVALID_PARAMS: Preview recipient/refund are required for dry quotes');
            }

            // Preview quote (dry: true) - use new payload structure
            body = {
              // amounts & assets
              amount: String(params.amount),
              swapType: 'EXACT_OUTPUT',
              destinationAsset: params.destinationAsset,
              originAsset: params.originAsset,

              // dry run
              dry: true,

              // routing & risk
              slippageTolerance: params.slippageTolerance ?? 100,
              quoteWaitingTimeMs: params.quoteWaitingTimeMs ?? 3000,

              // ✅ default from env if not provided
              recipientType: 'INTENTS',
              recipient: previewRecipient,
              refundType: 'INTENTS',
              refundTo: previewRefund,

              // deadline (required by 1-Click API)
              deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now

              // misc (optional but good practice)
              depositMode: 'SIMPLE',
              depositType: 'INTENTS',
              referral: params.referral,
              sessionId: params.sessionId,
            };

            console.log('[INTENTS_QUOTE_OUT]', body);

            // One-time assert log right before axios
            console.log('[INTENTS_QUOTE_OUT]', {
              dry: body.dry,
              originAsset: body.originAsset,
              destinationAsset: body.destinationAsset,
              amount: body.amount
            });
          } else {
            // Connected quote (post-connect) - non-dry
            body = {
              amount: String(params.amount),
              swapType: 'EXACT_OUTPUT',
              destinationAsset: params.destinationAsset,
              originAsset: params.originAsset,

              // connected quote (non-dry)
              dry: false,

              // ✅ recipients on the destination chain (NEAR), not INTENTS
              recipientType: 'DESTINATION_CHAIN',
              recipient: params.recipient ?? params.userWallet,   // e.g., 'pingtest.near'
              refundType: 'ORIGIN_CHAIN',
              refundTo: params.refundTo ?? params.userWallet,

              // routing & risk
              slippageTolerance: params.slippageTolerance ?? 100,
              quoteWaitingTimeMs: params.quoteWaitingTimeMs ?? 3000,

              // deadline (required by 1-Click API)
              deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now

              depositMode: 'SIMPLE',
              depositType: 'ORIGIN_CHAIN',
              referral: params.referral,
              sessionId: params.sessionId,
            };

            console.log('[INTENTS_SUBMIT_OUT]', JSON.stringify(body));
             
            // One-time assert log right before axios
            console.log('[INTENTS_SUBMIT_OUT]', {
              dry: body.dry,
              originAsset: body.originAsset,
              destinationAsset: body.destinationAsset,
              amount: body.amount
            });
          }

    // Debug: Log the exact request being sent
          const authHeader = `Bearer ${NEAR_ONECLICK_KEY}`;
          console.log('[AXIOS_AUTH]', { hasBearer: !!authHeader, authPrefix: String(authHeader || '').slice(0, 15) });
          console.log('[DEBUG] Sending request to 1-Click:', {
             url,
             fullUrl: url,
             base: base,
             path: path,
             headers: {
              'Authorization': `Bearer ${NEAR_ONECLICK_KEY ? '***' : 'MISSING'}`,
               'Content-Type': 'application/json'
             },
             body: JSON.stringify(body)
           });

          // Log JWT token details before making the request
          const tok = NEAR_ONECLICK_KEY;
          const parts = tok.split('.');
          const masked = parts.length === 3 ? `${parts[0]}.${parts[1].slice(0,6)}…` : 'invalid';
          console.info('[1CLICK AUTH]', { scheme: 'Bearer', tokenMasked: masked });

          // Decode exp once (no secret leak)
          try {
            const { exp } = JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString());
            console.info('[1CLICK AUTH expInSec]', exp - Math.floor(Date.now()/1000));
          } catch (e) {
            console.error('[1CLICK AUTH] failed to decode exp:', e.message);
          }

          // Add format check before sending
          if (!/^Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(`Bearer ${tok}`)) {
            console.error('[AUTH FORMAT] invalid Authorization header format');
          }

          const response = await axios.post(url, body, {
            headers: {
             'Authorization': authHeader,
              'Content-Type': 'application/json'
            },
            timeout: 10000,
            validateStatus: () => true   // ← key line
          });

          // Log and branch
          if (response.status >= 400) {
            console.error('[PROVIDER_STATUS]', JSON.stringify({
              status: response.status,
              purl: url,
              pmeth: 'post',
              providerBody: response.data,
              len: JSON.stringify(response.data || '').length
            }));
            throw new Error(`PROVIDER_ERROR: ${response.data?.message || 'Upstream validation error'}`);
          }

    // Log upstream status and payload shape
    try { console.log('[INTENTS_SUBMIT_IN]', response.status, JSON.stringify(response.data)); } catch {}

    console.log('[intents] 1Click response received:', {
      status: response.status,
      hasDeposit: !!response.data?.deposit,
      hasRouteId: !!response.data?.routeId
    });

    // Debug: Log raw response keys for connected quotes
    if (params.dry === false) {
      console.log('[CONNECTED_RAW_KEYS]', Object.keys(response.data || {}), response.data);
    }

    // Debug: Log the quote object specifically
    if (response.data?.quote) {
      console.log('[QUOTE_DEBUG]', {
        hasDepositAddress: Boolean(response.data.quote.depositAddress),
        depositAddress: response.data.quote.depositAddress,
        dry: response.data.quoteRequest?.dry,
        paramsDry: params.dry
      });
    }

    return normalizeIntentsResponse(response.data, params);

  } catch (error) {
    console.log('[PROVIDER_STATUS]', error.response?.status, error.response?.data);
    console.error('[intents] 1Click API error:', {
      status: error.response?.status,
      message: error.message,
      data: error.response?.data
    });

    // Map 1-Click errors to normalized codes
    const status = error.response?.status;
    const message = error.response?.data?.message || '';
    
    if (status === 401 || status === 403) {
      throw new Error('AUTH_ERROR: Session expired. Reconnect wallet');
    } else if (status === 404) {
      throw new Error('ROUTE_ERROR: Service path unavailable');
    } else if (status === 429) {
      throw new Error('RATE_LIMITED: Too many requests. Try again shortly');
    } else if (status >= 500) {
      throw new Error('PROVIDER_ERROR: Service temporarily unavailable');
    } else if (status >= 400 && status < 500) {
      // Map specific 1-Click error messages to normalized codes
      if (message.includes('tokenOut is not valid')) {
        throw new Error('TOKEN_OUT_INVALID: Payout token not supported');
      } else if (message.includes('amount must be a number string') || message.includes('Amount is too low')) {
        throw new Error('INVALID_AMOUNT: Amount must be greater than 0');
      } else if (message.includes('recipient/refundTo should not be empty')) {
        throw new Error('MISSING_RECIPIENT: Merchant payout address required');
      } else if (message.includes('slippageTolerance') || message.includes('deadline must be ISO 8601')) {
        throw new Error('VALIDATION_ERROR: Please check inputs');
      } else {
        throw new Error(`VALIDATION_ERROR: ${message || 'Invalid request'}`);
      }
    } else {
      throw new Error('PROVIDER_ERROR: Network error');
    }
  }
}

/**
 * Get status of intents transaction
 * @param {Object} params - Status parameters
 * @param {string} [params.routeId] - Route ID
 * @param {string} [params.depositAddress] - Deposit address
 * @returns {Promise<Object>} Status response
 */
export async function getIntentsStatus({ routeId }) {
  if (!NEAR_ONECLICK_KEY) {
    throw new Error('NEAR_ONECLICK_KEY not configured');
  }

  console.log('[intents] Getting status for:', { routeId });

  try {
    // Call 1-Click API status endpoint
    const url = `${process.env.TOKENS_FEED_BASE || 'https://1click.chaindefuser.com'}/v0/status`;
    const authHeader = `Bearer ${NEAR_ONECLICK_KEY}`;

    const response = await axios.get(url, {
      params: { routeId },
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      timeout: 10000,
      validateStatus: () => true // Accept all status codes
    });

    console.log('[STATUS_PROVIDER_RESPONSE]', {
      status: response.status,
      data: response.data
    });

    // Handle different response statuses
    if (response.status === 200) {
      const data = response.data;
      
      // Map 1-Click API response to our 3 states
      if (data.status === 'completed' || data.status === 'success') {
        return {
          status: 'completed',
          txId: data.txId || data.transactionId || data.txHash
        };
      } else if (data.status === 'failed' || data.status === 'error') {
        return {
          status: 'failed',
          reason: data.reason || data.message || data.error || 'Transaction failed'
        };
      } else {
        // Any other status (pending, processing, etc.) maps to pending
        return {
          status: 'pending'
        };
      }
    } else if (response.status === 404) {
      // Route not found - could be pending or failed
      // Default to pending to allow for eventual completion
      return {
        status: 'pending'
      };
    } else {
      // Other errors (4xx/5xx) - default to pending
      console.error('[STATUS_PROVIDER_ERROR]', {
        status: response.status,
        data: response.data
      });
      return {
        status: 'pending'
      };
    }
  } catch (error) {
    console.error('[STATUS_PROVIDER_EXCEPTION]', {
      message: error.message,
      code: error.code
    });
    
    // On any error, default to pending
    return {
      status: 'pending'
    };
  }
}

/**
 * Normalize 1Click response to standard format
 * @param {Object} data - Raw 1Click response
 * @returns {Object} Normalized response
 */
function normalizeIntentsResponse(data, params = {}) {
  const q = data?.quote;
  const qr = data?.quoteRequest;

  // If the provider returns a "quote" object, decide DRY vs CONNECTED by flags
  if (q) {
    const hasQuoteDeposit = Boolean(q?.depositAddress);
    const requestDry = qr?.dry;        // boolean | undefined
    const paramDry   = params?.dry;    // boolean | undefined

    // Connected if provider says dry:false, or you passed dry:false, or a depositAddress is present
    const isConnected =
      hasQuoteDeposit ||
      requestDry === false ||
      paramDry === false;

    // Dry otherwise (default to dry if nothing proves connected)
    const isDry = !isConnected;

    console.log('[NORMALIZE_DEBUG]', {
      hasQuoteDeposit,
      requestDry,
      paramDry,
      isConnected,
      isDry,
      depositAddress: q?.depositAddress,
    });

    if (isDry) {
      // 🔹 Preview / dry result → pricing only
      return {
        success: true,
        data: {
          total: q.amountOut,                          // USDC smallest units
          amount: q.amountOut,
          destAsset: params?.destinationAsset,
          sourceAsset: params?.originAsset,
          estimatedTime: q.timeEstimate ? '2-5 minutes' : undefined,
          expiresAt: q.deadline || data?.timestamp || undefined,
        },
      };
    }

    // 🔹 Connected / non-dry → must expose a deposit route
    const totalOut = q.amountOut ?? q.minAmountOut ?? null;
    
    return {
      success: true,
      data: {
        // Destination (what merchant receives)
        routeId: q.intentId || q.executionId || q.quoteId || q.depositAddress || null,
        total: totalOut,                      // 🔹 USDC output amount for UI display
        amount: totalOut,                     // (optional back-compat)
        destAsset: params?.destinationAsset ?? null,

        // Origin (what payer sends) – required for PAY button & transfer
        amountIn: q.amountIn ?? q.minAmountIn ?? null,
        minAmountIn: q.minAmountIn ?? null,
        sourceAsset: params?.originAsset ?? null,

        // Deposit route (where user sends origin tokens)
        deposit: {
          chain: (params?.destinationAsset || '').startsWith('nep141:') ? 'near' : 'near',
          address: q.depositAddress ?? null,
          memo: null,
          amount: q.amountIn ?? q.minAmountIn ?? null, // routing info (UI may ignore for display)
          asset: params?.originAsset ?? null,
        },

        // Lifecycle / UX metadata
        estimatedTime: q.timeEstimate ? '2-5 minutes' : undefined,
        expiresAt: q.deadline || undefined,

        // Optional USD hints (display only; no UI math)
        amountInUsd: q.amountInUsd ?? null,
        amountOutUsd: q.amountOutUsd ?? null,
      },
    };
  }

  // 🔸 Legacy/top-level format fallback (if provider returns deposit/route at top level)
  if (data?.deposit?.address || data?.routeId) {
    return {
      success: true,
      data: {
        routeId: data.routeId,
        deposit: {
          chain: data.deposit?.chain ?? 'near',
          address: data.deposit?.address,
          memo: data.deposit?.memo ?? null,
          amount: data.deposit?.amount ?? null,
          asset: data.deposit?.asset ?? params?.originAsset ?? null,
        },
        expiresAt: data.expiresAt ?? undefined,
      },
    };
  }

  throw new Error('PROVIDER_ERROR: Invalid response format');
}
