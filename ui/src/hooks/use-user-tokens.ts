import { useMemo } from 'react';
import { useGetUserTokens, useGetNativeNearBalance } from '@/integrations/api/tokens';
import NearIcon from '@/assets/icons/Near.png';

export interface ProcessedToken {
  accountId: string;
  symbol: string;
  name: string;
  icon: string;
  balance: string;
  balanceFormatted: string;
  balanceUsd: string;
  decimals: number;
  priceUsd: string;
}

function formatBalance(balance: string, decimals: number): string {
  const balanceNum = parseFloat(balance);
  if (isNaN(balanceNum) || balanceNum === 0) return '0';

  const divisor = Math.pow(10, decimals);
  const formatted = balanceNum / divisor;

  // Format with appropriate decimal places
  if (formatted < 0.01) {
    return formatted.toFixed(6);
  } else if (formatted < 1) {
    return formatted.toFixed(4);
  } else if (formatted < 100) {
    return formatted.toFixed(2);
  } else {
    return formatted.toFixed(0);
  }
}

function calculateUsdValue(balance: string, decimals: number, priceUsd: string): string {
  const balanceNum = parseFloat(balance);
  const priceNum = parseFloat(priceUsd);

  if (isNaN(balanceNum) || isNaN(priceNum) || balanceNum === 0 || priceNum === 0) {
    return '0.00';
  }

  const divisor = Math.pow(10, decimals);
  const balanceFormatted = balanceNum / divisor;
  const usdValue = balanceFormatted * priceNum;

  return usdValue.toFixed(2);
}

function sortTokens(tokens: ProcessedToken[]): ProcessedToken[] {
  return tokens.sort((a, b) => {
    // NEAR first
    if (a.symbol === 'NEAR' || a.symbol === 'wNEAR') return -1;
    if (b.symbol === 'NEAR' || b.symbol === 'wNEAR') return 1;

    // USDC second
    if (a.symbol === 'USDC') return -1;
    if (b.symbol === 'USDC') return 1;

    // Rest alphabetically by symbol
    return a.symbol.localeCompare(b.symbol);
  });
}

export function useUserTokens(accountId: string | undefined) {
  const { data, isLoading, error } = useGetUserTokens(accountId, !!accountId);
  const { data: nativeNearBalance, isLoading: isLoadingNear } = useGetNativeNearBalance(accountId, !!accountId);

  const processedTokens = useMemo(() => {
    const tokens: ProcessedToken[] = [];

    // If no accountId, return default tokens without balances
    if (!accountId) {
      return [
        {
          accountId: 'NATIVE',
          symbol: 'NEAR',
          name: 'NEAR',
          icon: NearIcon,
          balance: '0',
          balanceFormatted: '0',
          balanceUsd: '0.00',
          decimals: 24,
          priceUsd: '0',
        },
        {
          accountId: '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
          symbol: 'USDC',
          name: 'USD Coin',
          icon: 'https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png',
          balance: '0',
          balanceFormatted: '0',
          balanceUsd: '0.00',
          decimals: 6,
          priceUsd: '0',
        },
      ];
    }

    // Add native NEAR as the first token if we have a balance
    if (nativeNearBalance) {
      const balance = parseFloat(nativeNearBalance);
      if (!isNaN(balance) && balance > 0) {
        // Fetch NEAR price from wNEAR in the token list
        const wNearToken = data?.find(t => t.token?.metadata?.symbol === 'wNEAR');
        const nearPriceUsd = wNearToken?.token?.price_usd || '0';

        const balanceFormatted = formatBalance(nativeNearBalance, 24);
        const balanceUsd = calculateUsdValue(nativeNearBalance, 24, nearPriceUsd);

        tokens.push({
          accountId: 'NATIVE', // Special identifier for native NEAR
          symbol: 'NEAR',
          name: 'NEAR',
          icon: NearIcon,
          balance: nativeNearBalance,
          balanceFormatted,
          balanceUsd,
          decimals: 24,
          priceUsd: nearPriceUsd,
        });
      }
    }

    // Add token balances
    if (data) {
      const filtered = data
        .filter((userToken) => {
          const balance = parseFloat(userToken.balance);
          return !isNaN(balance) && balance > 0;
        })
        .map((userToken): ProcessedToken => {
          const { token, balance } = userToken;
          const balanceFormatted = formatBalance(balance, token.metadata.decimals);
          const balanceUsd = calculateUsdValue(balance, token.metadata.decimals, token.price_usd);

          return {
            accountId: token.account_id,
            symbol: token.metadata.symbol,
            name: token.metadata.name,
            icon: token.metadata.icon,
            balance,
            balanceFormatted,
            balanceUsd,
            decimals: token.metadata.decimals,
            priceUsd: token.price_usd,
          };
        });

      tokens.push(...filtered);
    }

    // Sort with NEAR first, then USDC, then alphabetically
    return sortTokens(tokens);
  }, [data, nativeNearBalance, accountId]);

  return {
    tokens: processedTokens,
    isLoading: isLoading || isLoadingNear,
    error: error instanceof Error ? error.message : undefined,
  };
}
