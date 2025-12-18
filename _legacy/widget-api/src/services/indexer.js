// src/services/indexer.js
import axios from 'axios';

// Indexer client with primary (Pagoda) and fallback (Nearblocks) APIs
const PAGODA_BASE = process.env.PAGODA_BASE || 'https://api.pagoda.co/v1';
const PAGODA_API_KEY = process.env.PAGODA_API_KEY || '';
const NEARBLOCKS_BASE = process.env.NEARBLOCKS_BASE || 'https://api.nearblocks.io/v1';
const NEARBLOCKS_API_KEY = process.env.NEARBLOCKS_API_KEY || '';
const GATING_PERMISSIVE_IF_INDEXER_DOWN = process.env.GATING_PERMISSIVE_IF_INDEXER_DOWN === 'true';

/**
 * Get holding for a specific asset
 * @param {string} wallet - Wallet address to check
 * @param {string} chainId - Chain identifier (e.g., "near:testnet")
 * @param {string} assetId - Asset identifier (e.g., "nep141:contract")
 * @returns {Promise<{amount: string, decimals: number}|null>} Holding info or null if not found
 */
export async function getHolding({ wallet, chainId, assetId }) {
  // Try primary indexer (Pagoda) first, then fallback (Nearblocks)
  let lastError;
  
  try {
    console.log(`[indexer] Getting holding via Pagoda for ${wallet} asset ${assetId}`);
    return await getHoldingPagoda(wallet, chainId, assetId);
  } catch (error) {
    console.warn(`[indexer] Pagoda failed for ${wallet}:`, error.message);
    lastError = error;
  }
  
  try {
    console.log(`[indexer] Getting holding via Nearblocks for ${wallet} asset ${assetId}`);
    return await getHoldingNearblocks(wallet, chainId, assetId);
  } catch (error) {
    console.error(`[indexer] Both indexers failed for ${wallet}:`, error.message);
    lastError = error;
  }
  
  // If both indexers fail, throw the last error to be handled by gating logic
  throw new Error(`Asset verification failed: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Check if wallet holds all required assets with minimum amounts
 * @param {string} wallet - Wallet address to check
 * @param {string} chainId - Chain identifier (e.g., "near:testnet")
 * @param {Array} requiredAssets - Array of {id: "nep141:contract", min: "1"} objects
 * @returns {Promise<boolean>} True if wallet holds all required assets
 */
export async function hasAllAssets({ wallet, chainId, requiredAssets }) {
  if (!requiredAssets || requiredAssets.length === 0) return true;
  
  for (const asset of requiredAssets) {
    const { id, min = "0" } = asset;
    
    try {
      const holding = await getHolding({ wallet, chainId, assetId: id });
      
      if (!holding) {
        console.log(`[indexer] ${wallet} does not hold ${id}`);
        return false;
      }
      
      // Convert min to smallest units using decimals
      const minAmount = BigInt(Math.floor(parseFloat(min) * Math.pow(10, holding.decimals)));
      const actualAmount = BigInt(holding.amount);
      
      if (actualAmount < minAmount) {
        console.log(`[indexer] ${wallet} holds ${holding.amount} ${id}, needs ${minAmount}`);
        return false;
      }
      
      console.log(`[indexer] ${wallet} holds ${holding.amount} ${id}, required ${minAmount} ✓`);
    } catch (error) {
      console.error(`[indexer] Failed to check ${id} for ${wallet}:`, error.message);
      
      // If indexers are down and permissive mode is enabled, allow through
      if (GATING_PERMISSIVE_IF_INDEXER_DOWN) {
        console.warn(`[indexer] Indexer down but permissive mode enabled for ${wallet}`);
        return true;
      }
      
      throw error;
    }
  }
  
  return true;
}

/**
 * Check if wallet holds required assets with minimum amounts (legacy wrapper)
 * @param {string} wallet - Wallet address to check
 * @param {string} chainId - Chain identifier (e.g., "near:testnet")
 * @param {Array} assets - Array of {id: "nep141:contract", min: "1"} objects
 * @returns {Promise<boolean>} True if wallet holds all required assets
 */
export async function checkAssetHoldings(wallet, chainId, assets) {
  try {
    return await hasAllAssets({ wallet, chainId, requiredAssets: assets });
  } catch (error) {
    // If indexers are down and permissive mode is enabled, allow through
    if (GATING_PERMISSIVE_IF_INDEXER_DOWN) {
      console.warn(`[indexer] Indexer down but permissive mode enabled for ${wallet}`);
      return true;
    }
    
    // Otherwise, re-throw the error to be handled by gating logic
    throw error;
  }
}

/**
 * Get holding via Pagoda Data API (primary)
 */
async function getHoldingPagoda(wallet, chainId, assetId) {
  const network = chainId === 'near:mainnet' ? 'mainnet' : 'testnet';
  
  if (assetId.startsWith('nep141:')) {
    // Check fungible token balance via Pagoda
    const contractId = assetId.replace('nep141:', '');
    return await getTokenBalancePagoda(wallet, contractId, network);
  } else if (assetId.startsWith('nep171:')) {
    // Check NFT ownership via Pagoda
    const contractId = assetId.replace('nep171:', '');
    return await getNftOwnershipPagoda(wallet, contractId, network);
  }
  
  throw new Error(`Unsupported asset type: ${assetId}`);
}

/**
 * Get holding via Nearblocks API (fallback)
 */
async function getHoldingNearblocks(wallet, chainId, assetId) {
  const network = chainId === 'near:mainnet' ? 'mainnet' : 'testnet';
  
  if (assetId.startsWith('nep141:')) {
    // Check fungible token balance via Nearblocks
    const contractId = assetId.replace('nep141:', '');
    return await getTokenBalanceNearblocks(wallet, contractId, network);
  } else if (assetId.startsWith('nep171:')) {
    // Check NFT ownership via Nearblocks
    const contractId = assetId.replace('nep171:', '');
    return await getNftOwnershipNearblocks(wallet, contractId, network);
  }
  
  throw new Error(`Unsupported asset type: ${assetId}`);
}

/**
 * Get token balance via Pagoda Data API
 */
async function getTokenBalancePagoda(wallet, contractId, network) {
  try {
    const url = `${PAGODA_BASE}/ft/balances`;
    const params = {
      account_id: wallet,
      contract_id: contractId
    };
    
    const headers = {
      'Content-Type': 'application/json'
    };
    if (PAGODA_API_KEY) {
      headers['Authorization'] = `Bearer ${PAGODA_API_KEY}`;
    }
    
    const response = await axios.get(url, { params, headers, timeout: 10000 });
    const data = response.data;
    
    if (!data || !data.balance) {
      return null;
    }
    
    return {
      amount: data.balance,
      decimals: data.decimals || 24
    };
  } catch (error) {
    if (error.response?.status === 404) {
      return null; // Token not found
    }
    console.error(`[indexer] Pagoda failed to get token balance for ${contractId}:`, error.message);
    throw new Error(`Pagoda token balance check failed: ${error.message}`);
  }
}

/**
 * Check NFT ownership via Pagoda Data API
 */
async function getNftOwnershipPagoda(wallet, contractId, network) {
  try {
    const url = `${PAGODA_BASE}/nft/owners`;
    const params = {
      account_id: wallet,
      contract_id: contractId
    };
    
    const headers = {
      'Content-Type': 'application/json'
    };
    if (PAGODA_API_KEY) {
      headers['Authorization'] = `Bearer ${PAGODA_API_KEY}`;
    }
    
    const response = await axios.get(url, { params, headers, timeout: 10000 });
    const data = response.data;
    
    if (!data || !data.tokens || data.tokens.length === 0) {
      return null;
    }
    
    // For NFTs, return count as amount with 0 decimals
    return {
      amount: data.tokens.length.toString(),
      decimals: 0
    };
  } catch (error) {
    if (error.response?.status === 404) {
      return null; // NFT not found
    }
    console.error(`[indexer] Pagoda failed to check NFT ownership for ${contractId}:`, error.message);
    throw new Error(`Pagoda NFT ownership check failed: ${error.message}`);
  }
}

/**
 * Get token balance via Nearblocks API (fallback)
 */
async function getTokenBalanceNearblocks(wallet, contractId, network) {
  try {
    const url = `${NEARBLOCKS_BASE}/account/${wallet}/fungible-tokens`;
    const params = {
      network,
      contract: contractId
    };
    
    const headers = {};
    if (NEARBLOCKS_API_KEY) {
      headers['Authorization'] = `Bearer ${NEARBLOCKS_API_KEY}`;
    }
    
    const response = await axios.get(url, { params, headers, timeout: 10000 });
    const data = response.data;
    
    if (!data || !data.balance) {
      return null;
    }
    
    return {
      amount: data.balance,
      decimals: data.decimals || 24
    };
  } catch (error) {
    if (error.response?.status === 404) {
      return null; // Token not found
    }
    console.error(`[indexer] Nearblocks failed to get token balance for ${contractId}:`, error.message);
    throw new Error(`Nearblocks token balance check failed: ${error.message}`);
  }
}

/**
 * Check NFT ownership via Nearblocks API (fallback)
 */
async function getNftOwnershipNearblocks(wallet, contractId, network) {
  try {
    const url = `${NEARBLOCKS_BASE}/account/${wallet}/nfts`;
    const params = {
      network,
      contract: contractId
    };
    
    const headers = {};
    if (NEARBLOCKS_API_KEY) {
      headers['Authorization'] = `Bearer ${NEARBLOCKS_API_KEY}`;
    }
    
    const response = await axios.get(url, { params, headers, timeout: 10000 });
    const data = response.data;
    
    if (!data || !data.tokens || data.tokens.length === 0) {
      return null;
    }
    
    // For NFTs, return count as amount with 0 decimals
    return {
      amount: data.tokens.length.toString(),
      decimals: 0
    };
  } catch (error) {
    if (error.response?.status === 404) {
      return null; // NFT not found
    }
    console.error(`[indexer] Nearblocks failed to check NFT ownership for ${contractId}:`, error.message);
    throw new Error(`Nearblocks NFT ownership check failed: ${error.message}`);
  }
}
