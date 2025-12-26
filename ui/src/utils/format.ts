import NearIcon from '@/assets/icons/Near.png';
import UsdcIcon from '@/assets/icons/usdc.png';

/**
 * Format asset amount with proper decimals
 * USDC: 6 decimals (1 USDC = 1000000)
 * NEAR: 24 decimals (1 NEAR = 1000000000000000000000000)
 */
export function formatAssetAmount(amount: string, assetId: string): string {
  const asset = assetId.replace(/^nep141:/, '').toLowerCase();
  
  let decimals = 0;
  if (asset.includes('usdc') || asset.includes('usdt')) {
    decimals = 6;
  } else if (asset.includes('wrap.near') || asset.includes('near')) {
    decimals = 24;
  } else {
    // Default to 6 decimals for unknown assets
    decimals = 6;
  }

  const amountBigInt = BigInt(amount);
  const divisor = BigInt(10 ** decimals);
  const whole = amountBigInt / divisor;
  const fractional = amountBigInt % divisor;

  if (fractional === BigInt(0)) {
    return whole.toString();
  }

  const fractionalStr = fractional.toString().padStart(decimals, '0');
  const trimmed = fractionalStr.replace(/0+$/, '');
  
  return `${whole}.${trimmed}`;
}

/**
 * Asset ID to name mapping
 */
const ASSET_ID_TO_NAME: Record<string, string> = {
  'nep141:wrap.near': 'NEAR',
  'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1': 'USDC',
};

export function getAssetSymbol(assetId: string): string {
  // Check exact match first
  if (ASSET_ID_TO_NAME[assetId]) {
    return ASSET_ID_TO_NAME[assetId];
  }

  // Fallback to pattern matching
  const asset = assetId.replace(/^nep141:/, '').toLowerCase();
  if (asset.includes('usdc')) return 'USDC';
  if (asset.includes('usdt')) return 'USDT';
  if (asset.includes('wrap.near') || asset.includes('near')) return 'NEAR';
  return asset.toUpperCase();
}

/**
 * Asset symbol to icon path mapping
 */
const ASSET_SYMBOL_TO_ICON: Record<string, string> = {
  'NEAR': NearIcon,
  'USDC': UsdcIcon,
};

/**
 * Get asset icon URL or null if no icon available
 * Returns local icon paths for NEAR and USDC, null for others
 */
export function getAssetIcon(assetId: string): string | null {
  const symbol = ASSET_ID_TO_NAME[assetId];
  
  if (symbol && ASSET_SYMBOL_TO_ICON[symbol]) {
    return ASSET_SYMBOL_TO_ICON[symbol];
  }

  // Fallback to pattern matching using getAssetSymbol
  const fallbackSymbol = getAssetSymbol(assetId);
  return ASSET_SYMBOL_TO_ICON[fallbackSymbol] || null;
}

