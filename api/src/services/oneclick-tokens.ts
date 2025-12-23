import { Effect } from 'every-plugin/effect';

/**
 * OneClick Token Service
 * 
 * Provides utilities for fetching and resolving tokens from the OneClick API.
 * Supports both UI display names and API symbols for flexible usage.
 * 
 * Usage Flow:
 * 
 * // Option 1: Using display names (recommended for UI)
 * const assetId = await Effect.runPromise(
 *   resolveAssetIdFromDisplay("Near", "NEAR")
 * );
 * 
 * // Option 2: Using API symbols directly
 * const assetId = await Effect.runPromise(
 *   resolveAssetId("wnear", "NEAR")
 * );
 * 
 * // Option 3: Manual lookup
 * const tokens = await Effect.runPromise(fetchOneClickTokens());
 * const token = find1ClickAsset(tokens, "wnear", "NEAR");
 * const assetId = token?.assetId;
 * 
 * Display Name to Symbol Mapping:
 * - "Near" → "wnear"
 * - "USD Coin" → "USDC"
 * - "Tether USD" → "USDT"
 */

export interface OneClickToken {
  assetId: string;
  decimals: number;
  blockchain: string;
  symbol: string;
  price?: string;
  priceUpdatedAt?: string;
  contractAddress?: string;
}

const ONECLICK_BASE_URL = 'https://1click.chaindefuser.com';

/**
 * Asset Display Name to API Symbol Mapping
 * Maps UI display names to the symbols used by the 1Click API
 */
const assetDisplayToSymbolMap: Record<string, string> = {
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
export function getAssetSymbolFromDisplay(displayName: string): string {
  return assetDisplayToSymbolMap[displayName] || displayName;
}

/**
 * Fetch all tokens from the OneClick /tokens endpoint
 */
export function fetchOneClickTokens(): Effect.Effect<OneClickToken[], Error> {
  return Effect.gen(function* (_) {
    const url = `${ONECLICK_BASE_URL}/v0/tokens`;
    
    const tokens = yield* _(
      Effect.tryPromise({
        try: async () => {
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          });
          
          if (!response.ok) {
            throw new Error(`Failed to fetch tokens: ${response.status} ${response.statusText}`);
          }
          
          return await response.json() as OneClickToken[];
        },
        catch: (error) => {
          return new Error(`Failed to fetch OneClick tokens: ${error instanceof Error ? error.message : String(error)}`);
        },
      })
    );
    
    return tokens;
  });
}

/**
 * Helper to find a specific token from the list
 */
export function find1ClickAsset(
  tokens: OneClickToken[],
  symbol: string,
  blockchain: string,
): OneClickToken | undefined {
  return tokens.find(
    (token) =>
      token.symbol.toLowerCase() === symbol.toLowerCase() &&
      token.blockchain.toLowerCase() === blockchain.toLowerCase(),
  );
}

/**
 * Resolve assetId from symbol and blockchain by fetching tokens from OneClick API
 * @param symbol - API symbol (e.g., "wnear", "USDC") or display name (e.g., "Near", "USD Coin")
 * @param blockchain - Blockchain name (e.g., "NEAR", "near")
 */
export function resolveAssetId(
  symbol: string,
  blockchain: string,
): Effect.Effect<string, Error> {
  return Effect.gen(function* (_) {
    // Convert display name to API symbol if needed
    const apiSymbol = getAssetSymbolFromDisplay(symbol);
    
    const tokens = yield* _(fetchOneClickTokens());
    const token = find1ClickAsset(tokens, apiSymbol, blockchain);
    
    if (!token) {
      return yield* _(
        Effect.fail(
          new Error(`Token not found: ${symbol} (${apiSymbol}) on ${blockchain}`)
        )
      );
    }
    
    return token.assetId;
  });
}

/**
 * Resolve assetId from display name and blockchain
 * Convenience function that explicitly handles display name conversion
 * @param displayName - UI display name (e.g., "Near", "USD Coin")
 * @param blockchain - Blockchain name (e.g., "NEAR", "near")
 */
export function resolveAssetIdFromDisplay(
  displayName: string,
  blockchain: string,
): Effect.Effect<string, Error> {
  const apiSymbol = getAssetSymbolFromDisplay(displayName);
  return resolveAssetId(apiSymbol, blockchain);
}

