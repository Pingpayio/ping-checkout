// src/services/intents/amounts.js
// Amount conversion utilities for intents (separate from on-ramp)

/**
 * Convert decimal amount to smallest units
 * @param {string} decimalStr - Decimal amount as string
 * @param {number} decimals - Token decimals
 * @returns {string} Amount in smallest units
 */
export function toSmallestUnits(decimalStr, decimals) {
  if (!decimalStr || typeof decimalStr !== 'string') {
    throw new Error('Invalid decimal amount');
  }
  
  if (typeof decimals !== 'number' || decimals < 0 || decimals > 30) {
    throw new Error('Invalid decimals');
  }

  const [intPart, frac = ""] = String(decimalStr).split(".");
  
  // Validate integer part
  if (!/^\d+$/.test(intPart)) {
    throw new Error(`Invalid decimal amount: ${decimalStr}`);
  }
  
  // Validate fractional part
  if (frac && !/^\d+$/.test(frac)) {
    throw new Error(`Invalid decimal amount: ${decimalStr}`);
  }

  // Pad fractional part to required decimals
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  
  // Combine and remove leading zeros
  const raw = (intPart + fracPadded).replace(/^0+/, "");
  
  return raw === "" ? "0" : raw;
}

/**
 * Get token decimals from asset ID
 * @param {string} assetId - Asset identifier
 * @returns {Promise<number>} Token decimals
 */
export async function getTokenDecimals(assetId) {
  try {
    // Extract network from asset ID
    const [protocol, network, ...rest] = assetId.split(':');
    
    if (protocol === 'nep141') {
      // NEAR tokens typically use 24 decimals, but USDC uses 6
      if (assetId.includes('17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1')) {
        return 6; // USDC on NEAR
      }
      return 24;
    } else if (protocol === 'eip155') {
      // EVM tokens vary, but USDC/USDT use 6, others use 18
      const tokenAddress = rest[0]?.toLowerCase();
      if (tokenAddress && (tokenAddress.includes('usdc') || tokenAddress.includes('usdt'))) {
        return 6;
      }
      return 18;
    } else if (protocol === 'solana') {
      // Solana tokens typically use 6-9 decimals
      return 6;
    }
    
    // Default fallback
    return 18;
  } catch (error) {
    console.warn(`[intents] Failed to determine decimals for ${assetId}, using default 18:`, error.message);
    return 18;
  }
}

/**
 * Convert amount to smallest units with automatic decimal detection
 * @param {string} amount - Decimal amount
 * @param {string} assetId - Asset identifier
 * @returns {Promise<string>} Amount in smallest units
 */
export async function convertAmountToSmallestUnits(amount, assetId) {
  const decimals = await getTokenDecimals(assetId);
  return toSmallestUnits(amount, decimals);
}
