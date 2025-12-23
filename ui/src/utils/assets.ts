/**
 * NEAR Asset List for UI
 * Used for displaying available payment assets to users
 */
export interface NearAsset {
  id: string; // Display name (e.g., "Near", "USD Coin")
  name: string; // Symbol for display (e.g., "NEAR", "USDC")
  flag: string; // Path to asset icon
}

export const nearAssets: NearAsset[] = [
  { id: "Near", name: "NEAR", flag: "/Near.png" },
  { id: "USD Coin", name: "USDC", flag: "/USD Coin.png" },
  { id: "Tether USD", name: "USDT", flag: "/Tether USD.png" },
];

/**
 * Asset Display Name to API Symbol Mapping
 * Maps UI display names to the symbols used by the 1Click API
 */
export const assetDisplayToSymbolMap: Record<string, string> = {
  // Primary mappings
  "Near": "wnear",
  "USD Coin": "USDC",
  "Tether USD": "USDT",
  
  // Fallbacks (direct symbol usage)
  "USDC": "USDC",
  "USDT": "USDT",
  "NEAR": "wnear",
  "wnear": "wnear",
  "wNEAR": "wnear",
  "WRAP": "wnear",
};

/**
 * Convert UI display name to API symbol
 * @param displayName - The display name from UI (e.g., "Near", "USD Coin")
 * @returns The API symbol (e.g., "wnear", "USDC")
 */
export function getAssetSymbol(displayName: string): string {
  return assetDisplayToSymbolMap[displayName] || displayName;
}

/**
 * Get asset by display name
 */
export function getAssetByDisplayName(displayName: string): NearAsset | undefined {
  return nearAssets.find(asset => asset.id === displayName || asset.name === displayName);
}

/**
 * Get asset by API symbol
 */
export function getAssetBySymbol(symbol: string): NearAsset | undefined {
  const displayName = Object.keys(assetDisplayToSymbolMap).find(
    key => assetDisplayToSymbolMap[key] === symbol
  );
  if (!displayName) return undefined;
  return getAssetByDisplayName(displayName);
}

/**
 * Convert ProcessedToken to asset format for payment preparation
 * Maps token symbols to API symbols using the display-to-symbol mapping
 */
export function tokenToAssetFormat(token: { symbol: string; accountId: string }): {
  chain: string;
  symbol: string;
} {
  // For native NEAR, use wnear as the symbol
  if (token.accountId === 'NATIVE' || token.symbol === 'NEAR') {
    return { chain: 'NEAR', symbol: 'wnear' };
  }
  
  // For other tokens, use the symbol directly (it should match API symbols)
  // If it doesn't match, try to map it
  const apiSymbol = getAssetSymbol(token.symbol);
  return { chain: 'NEAR', symbol: apiSymbol };
}

