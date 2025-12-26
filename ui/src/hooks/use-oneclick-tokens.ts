import { useQuery } from '@tanstack/react-query';

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

async function fetchOneClickTokens(): Promise<OneClickToken[]> {
  const url = `${ONECLICK_BASE_URL}/v0/tokens`;
  
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
}

/**
 * Hook to fetch all tokens from OneClick API
 */
export function useOneClickTokens() {
  return useQuery({
    queryKey: ['oneclick-tokens'],
    queryFn: fetchOneClickTokens,
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    refetchInterval: 10 * 60 * 1000, // Refetch every 10 minutes
  });
}

/**
 * Get tokens filtered by blockchain
 */
export function useOneClickTokensByChain(blockchain: string) {
  const { data: allTokens, isLoading, error } = useOneClickTokens();
  
  const filteredTokens = allTokens?.filter(
    (token) => token.blockchain.toLowerCase() === blockchain.toLowerCase()
  ) || [];
  
  return {
    tokens: filteredTokens,
    isLoading,
    error,
  };
}

