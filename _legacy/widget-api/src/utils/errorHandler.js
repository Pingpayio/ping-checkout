// src/utils/errorHandler.js
// Frontend error handling for widget-api normalized errors

/**
 * Normalize API error response to UI-friendly format
 * @param {Object} response - API response object
 * @returns {Object} Normalized error with kind, code, and message
 */
export function normalizeApiError(response) {
  if (!response || response.success === true) {
    return { kind: 'toast', code: 'SUCCESS', msg: 'OK' };
  }

  const code = response.error || 'UNKNOWN';
  const M = {
    INVALID_AMOUNT:        { kind: 'inline', msg: 'Amount must be greater than 0' },
    SAME_ASSET_SWAP:       { kind: 'card',   msg: 'Select a different payout token' },
    INVALID_RECIPIENT_ENV: { kind: 'card',   msg: 'Use a mainnet wallet address' },
    MISSING_RECIPIENT:     { kind: 'card',   msg: 'Merchant payout address required' },
    MISSING_REFUND_TO:     { kind: 'card',   msg: 'Buyer wallet required' },
    TOKEN_OUT_INVALID:     { kind: 'card',   msg: 'Payout token not supported' },
    VALIDATION_ERROR:      { kind: 'card',   msg: response.message || 'Please check inputs' },
    AUTH_ERROR:            { kind: 'card',   msg: 'Session expired. Reconnect wallet' },
    ROUTE_ERROR:           { kind: 'toast',  msg: 'Service path unavailable' },
    RATE_LIMITED:          { kind: 'toast',  msg: 'Too many requests. Try again' },
    PROVIDER_ERROR:        { kind: 'toast',  msg: 'Service temporarily unavailable' },
    UNKNOWN:               { kind: 'toast',  msg: 'Unable to get quote. Retry.' }
  };
  
  return { 
    kind: M[code]?.kind ?? 'toast', 
    code, 
    msg: M[code]?.msg ?? M.UNKNOWN.msg 
  };
}

/**
 * Check if error is retryable
 * @param {string} code - Error code
 * @returns {boolean} Whether the error can be retried
 */
export function isRetryableError(code) {
  const retryableCodes = ['RATE_LIMITED', 'PROVIDER_ERROR', 'ROUTE_ERROR'];
  return retryableCodes.includes(code);
}

/**
 * Get retry delay in milliseconds
 * @param {string} code - Error code
 * @returns {number} Delay in ms
 */
export function getRetryDelay(code) {
  switch (code) {
    case 'RATE_LIMITED': return 5000; // 5 seconds
    case 'PROVIDER_ERROR': return 10000; // 10 seconds
    case 'ROUTE_ERROR': return 30000; // 30 seconds
    default: return 5000;
  }
}
