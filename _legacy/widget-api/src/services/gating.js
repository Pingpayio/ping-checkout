// src/services/gating.js
import { getAllowlistWallets } from "../repos/allowlist.js";
import { checkAssetHoldings } from "./indexer.js";

export async function isWalletAllowlisted({ wallet, allowlist }) {
  if (!allowlist || allowlist.length === 0) return true;
  // normalize addresses if needed; exact match for now
  return allowlist.includes(wallet);
}

export async function holdsRequiredAssets({ wallet, chainId, assets }) {
  if (!assets || assets.length === 0) return true;
  
  try {
    return await checkAssetHoldings(wallet, chainId, assets);
  } catch (error) {
    console.error(`[gating] Asset check failed for ${wallet}:`, error.message);
    
    // If indexer is down, check if we should fail open or closed
    const failOpenOnIndexerDown = process.env.GATING_PERMISSIVE_IF_INDEXER_DOWN === 'true';
    if (failOpenOnIndexerDown) {
      console.warn(`[gating] Indexer down, failing open for ${wallet}`);
      return true;
    }
    
    // Default: fail closed for security
    return false;
  }
}

/**
 * Throws an Error with .status=403 on failure
 * @param {Object} cfg  - Pay link config (advancedOptions.gating)
 * @param {Object} ctx  - { wallet, chainId, payLinkId }
 */
export async function requireEligible(cfg, ctx) {
  const gating = (cfg && cfg.gating) || {};
  const allowlist = gating.allowlist || gating.allowlistCsv || gating.wallets || [];
  const requiredAssets = gating.assets || gating.nftContracts || [];

  // 1) allowlist - use config list if provided, otherwise load from database
  let finalAllowlist = allowlist;
  if (!finalAllowlist || finalAllowlist.length === 0) {
    finalAllowlist = getAllowlistWallets(ctx.payLinkId);
  }
  
  const okList = await isWalletAllowlisted({ wallet: ctx.wallet, allowlist: finalAllowlist });
  if (!okList) {
    const e = new Error("Wallet not allowlisted");
    e.status = 403; e.code = "GATING_FAIL";
    throw e;
  }

  // 2) required NFTs/tokens
  console.log(`[gating] Checking assets for ${ctx.wallet}:`, requiredAssets);
  try {
    const okAssets = await holdsRequiredAssets({ wallet: ctx.wallet, chainId: ctx.chainId, assets: requiredAssets });
    console.log(`[gating] Asset check result for ${ctx.wallet}:`, okAssets);
    if (!okAssets) {
      const e = new Error("Required NFT/asset not held");
      e.status = 403; e.code = "GATING_FAIL";
      throw e;
    }
  } catch (error) {
    // If it's already a gating error, re-throw it
    if (error.code === "GATING_FAIL") {
      throw error;
    }
    
    // If indexer is down and we're not failing open, return 502
    const failOpenOnIndexerDown = process.env.GATING_PERMISSIVE_IF_INDEXER_DOWN === 'true';
    if (!failOpenOnIndexerDown) {
      const e = new Error("Asset verification service unavailable");
      e.status = 502; e.code = "VERIFY_ERROR";
      throw e;
    }
    
    // If we're failing open, continue (this shouldn't happen due to the try/catch in holdsRequiredAssets)
    console.warn(`[gating] Indexer error but failing open: ${error.message}`);
  }
}
