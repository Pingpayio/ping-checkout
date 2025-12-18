// src/services/tokenMeta.js
import { getTokens } from './oneClickTokens.js';

/**
 * Token metadata service
 * Resolves asset metadata from cached 1-Click tokens or fallback data
 */

// Fallback token metadata for common assets
const FALLBACK_TOKENS = {
  'nep141:wrap.near': {
    symbol: 'wNEAR',
    decimals: 24,
    iconUrl: 'https://near.org/wp-content/themes/near-19/assets/img/near-icon.svg',
    chainId: 'near:mainnet'
  },
  'nep141:usdc.testnet': {
    symbol: 'USDC',
    decimals: 6,
    iconUrl: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png',
    chainId: 'near:testnet'
  },
  'nep141:usdc.near': {
    symbol: 'USDC',
    decimals: 6,
    iconUrl: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png',
    chainId: 'near:mainnet'
  },
  'nep141:blackdragon.testnet': {
    symbol: 'BD',
    decimals: 18,
    iconUrl: 'https://blackdragon.com/logo.png',
    chainId: 'near:testnet'
  },
  'nep141:blackdragon.near': {
    symbol: 'BD',
    decimals: 18,
    iconUrl: 'https://blackdragon.com/logo.png',
    chainId: 'near:mainnet'
  }
};

/**
 * Get token metadata for an asset ID
 * @param {string} assetId - Asset ID (e.g., "nep141:wrap.near")
 * @param {string} chainId - Chain ID (e.g., "near:mainnet")
 * @returns {Object|null} Token metadata or null if not found
 */
export async function getTokenMeta(assetId, chainId = 'near:mainnet') {
  if (!assetId) return null;

  try {
    // Try to get from 1-Click tokens cache first
    const tokens = await getTokens();
    const token = tokens.find(t => t.id === assetId);
    
    if (token) {
      return {
        symbol: token.symbol || 'UNKNOWN',
        decimals: token.decimals || 0,
        iconUrl: token.iconUrl || null,
        chainId: chainId
      };
    }
  } catch (error) {
    console.warn('[tokenMeta] Failed to get from 1-Click cache:', error.message);
  }

  // Fallback to hardcoded metadata
  const fallback = FALLBACK_TOKENS[assetId];
  if (fallback) {
    return {
      ...fallback,
      chainId: chainId
    };
  }

  // Generate basic metadata for unknown tokens
  const parts = assetId.split(':');
  if (parts.length === 2) {
    const [, contract] = parts;
    return {
      symbol: contract.toUpperCase(),
      decimals: 18, // Default to 18 decimals
      iconUrl: null,
      chainId: chainId
    };
  }

  return null;
}

/**
 * Get metadata for multiple assets
 * @param {Array<string>} assetIds - Array of asset IDs
 * @param {string} chainId - Chain ID
 * @returns {Object} Map of assetId to metadata
 */
export async function getTokensMeta(assetIds, chainId = 'near:mainnet') {
  const tokens = {};
  
  for (const assetId of assetIds) {
    const meta = await getTokenMeta(assetId, chainId);
    if (meta) {
      tokens[assetId] = meta;
    }
  }
  
  return tokens;
}
