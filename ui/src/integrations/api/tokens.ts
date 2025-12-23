import { useQuery } from '@tanstack/react-query';

export interface TokenMetadata {
  icon: string;
  name: string;
  symbol: string;
  decimals: number;
}

export interface Token {
  account_id: string;
  circulating_supply: string;
  circulating_supply_excluding_team: string;
  created_at: number;
  deleted: boolean;
  liquidity_usd: number;
  main_pool: string;
  metadata: TokenMetadata;
  price_usd: string;
  price_usd_hardcoded: string;
  price_usd_raw: string;
  price_usd_raw_24h_ago: string;
  reputation: string;
  total_supply: string;
  volume_usd_24h: number;
}

export interface UserToken {
  balance: string;
  source: string;
  token: Token;
}

export interface UserTokensResponse {
  tokens: UserToken[];
}

async function fetchUserTokens(accountId: string): Promise<UserToken[]> {
  const response = await fetch(
    `https://prices.intear.tech/get-user-tokens?account_id=${accountId}&direct=true&rhea=true`
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch user tokens: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
}

async function fetchNativeNearBalance(accountId: string): Promise<string> {
  const response = await fetch('https://rpc.mainnet.near.org', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'dontcare',
      method: 'query',
      params: {
        request_type: 'view_account',
        finality: 'final',
        account_id: accountId,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch NEAR balance: ${response.statusText}`);
  }

  const data = await response.json();
  return data.result?.amount || '0';
}

export function useGetUserTokens(accountId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['user-tokens', accountId],
    queryFn: async (): Promise<UserToken[]> => {
      if (!accountId) throw new Error('Account ID is required');
      return await fetchUserTokens(accountId);
    },
    enabled: enabled && !!accountId,
    staleTime: 30000, // Consider data fresh for 30 seconds
    refetchInterval: 60000, // Refetch every 60 seconds to keep balances updated
  });
}

export function useGetNativeNearBalance(accountId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['native-near-balance', accountId],
    queryFn: async (): Promise<string> => {
      if (!accountId) throw new Error('Account ID is required');
      return await fetchNativeNearBalance(accountId);
    },
    enabled: enabled && !!accountId,
    staleTime: 30000,
    refetchInterval: 60000,
  });
}
