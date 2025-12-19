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

export function getAssetSymbol(assetId: string): string {
  const asset = assetId.replace(/^nep141:/, '').toLowerCase();
  if (asset.includes('usdc')) return 'USDC';
  if (asset.includes('usdt')) return 'USDT';
  if (asset.includes('wrap.near') || asset.includes('near')) return 'NEAR';
  return asset.toUpperCase();
}

