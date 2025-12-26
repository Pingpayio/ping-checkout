import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { type ProcessedToken } from '@/hooks/use-user-tokens';
import { useOneClickTokensByChain } from '@/hooks/use-oneclick-tokens';
import { useGetUserTokens, useGetNativeNearBalance } from '@/integrations/api/tokens';
import { CloseIcon, ChevronDownIcon } from './icons';
import PingIcon from '@/assets/logos/PING_ICON.png';
import { NetworkSelectionModal } from './network-selection-modal';
import NearIcon from '@/assets/icons/Near.png';

// Network icon map
const networkIcons: Record<string, string> = {
  NEAR: NearIcon,
  // Future networks can be added here
  // Example: 'Ethereum': EthereumIcon,
};

interface AssetSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId?: string | undefined; // Optional, not used for OneClick tokens
  onSelectToken: (token: ProcessedToken) => void;
  selectedTokenAccountId?: string;
}

const SearchIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M9 17A8 8 0 1 0 9 1a8 8 0 0 0 0 16zM18 18l-4.35-4.35"
      stroke="#AF9EF9"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CheckIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="text-primary"
  >
    <path
      d="M16.667 5L7.5 14.167 3.333 10"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Symbol to display name mapping for better UX
 */
const symbolToDisplayName: Record<string, string> = {
  'wnear': 'NEAR',
  'wNEAR': 'NEAR',
  'USDC': 'USD Coin',
  'USDT': 'Tether USD',
};

export const AssetSelectionModal = ({
  open,
  onOpenChange,
  accountId,
  onSelectToken,
  selectedTokenAccountId,
}: AssetSelectionModalProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState('NEAR');
  
  // Fetch OneClick tokens for the selected network
  const { tokens: oneClickTokens, isLoading: isLoadingOneClick } = useOneClickTokensByChain(selectedNetwork);
  
  // Check if wallet is connected
  const isWalletConnected = !!accountId;
  
  // Fetch all user tokens from Intear API (if wallet connected)
  const { data: userTokensData, isLoading: isLoadingUserTokens } = useGetUserTokens(
    accountId || undefined,
    isWalletConnected
  );
  
  // Fetch native NEAR balance (if wallet connected)
  const { data: nativeNearBalance, isLoading: isLoadingNearBalance } = useGetNativeNearBalance(
    accountId || undefined,
    isWalletConnected
  );
  
  const isLoadingBalancesData = isLoadingUserTokens || isLoadingNearBalance;
  
  // Create a map of user token balances by contract address for quick lookup
  const userTokenBalanceMap = useMemo(() => {
    const balanceMap: Record<string, { balance: string; decimals: number; icon?: string }> = {};
    
    if (userTokensData) {
      userTokensData.forEach((userToken) => {
        const contractAddress = userToken.token.account_id;
        const balance = parseFloat(userToken.balance);
        // Only include tokens with balance > 0
        if (!isNaN(balance) && balance > 0) {
          balanceMap[contractAddress] = {
            balance: userToken.balance,
            decimals: userToken.token.metadata.decimals,
            icon: userToken.token.metadata.icon,
          };
        }
      });
    }
    
    return balanceMap;
  }, [userTokensData]);
  
  // Helper functions for formatting
  const formatBalance = (balance: string, decimals: number): string => {
    const balanceNum = parseFloat(balance);
    if (isNaN(balanceNum) || balanceNum === 0) return '0';

    const divisor = Math.pow(10, decimals);
    const formatted = balanceNum / divisor;

    if (formatted < 0.01) {
      return formatted.toFixed(6);
    } else if (formatted < 1) {
      return formatted.toFixed(4);
    } else if (formatted < 100) {
      return formatted.toFixed(2);
    } else {
      return formatted.toFixed(0);
    }
  };

  const calculateUsdValue = (balance: string, decimals: number, priceUsd: string): string => {
    const balanceNum = parseFloat(balance);
    const priceNum = parseFloat(priceUsd);

    if (isNaN(balanceNum) || isNaN(priceNum) || balanceNum === 0 || priceNum === 0) {
      return '0.00';
    }

    const divisor = Math.pow(10, decimals);
    const balanceFormatted = balanceNum / divisor;
    const usdValue = balanceFormatted * priceNum;

    return usdValue.toFixed(2);
  };
  
  // Convert OneClick tokens to ProcessedToken format with user balances
  const tokens = useMemo(() => {
    if (!oneClickTokens.length) return [];
    
    return oneClickTokens.map((oneClickToken): ProcessedToken => {
      const contractAddress = oneClickToken.contractAddress;
      if (!contractAddress) {
        // Skip tokens without contract address
        return {
          accountId: '',
          symbol: oneClickToken.symbol,
          name: symbolToDisplayName[oneClickToken.symbol] || oneClickToken.symbol,
          icon: '',
          balance: '',
          balanceFormatted: '',
          balanceUsd: '',
          decimals: oneClickToken.decimals,
          priceUsd: oneClickToken.price || '0',
        };
      }
      
      const displayName = symbolToDisplayName[oneClickToken.symbol] || oneClickToken.symbol;
      const priceUsd = oneClickToken.price || '0';
      
      // Handle native NEAR (wrap.near)
      if (contractAddress === 'wrap.near') {
        // Show balance if wallet is connected and data is loaded (even if 0)
        let balance = '';
        let balanceFormatted = '';
        let balanceUsd = '';
        
        if (isWalletConnected && !isLoadingBalancesData && nativeNearBalance !== undefined) {
          // Always show balance, even if 0
          balance = nativeNearBalance || '0';
          balanceFormatted = formatBalance(balance, 24);
          balanceUsd = calculateUsdValue(balance, 24, priceUsd);
        }
        
        return {
          accountId: 'NATIVE',
          symbol: oneClickToken.symbol,
          name: displayName,
          icon: NearIcon,
          balance,
          balanceFormatted,
          balanceUsd,
          decimals: 24,
          priceUsd,
        };
      }
      
      // Handle other tokens - get balance from userTokenBalanceMap (Intear API)
      let balance = '';
      let balanceFormatted = '';
      let balanceUsd = '';
      let tokenIcon = '';
      
      if (isWalletConnected && !isLoadingBalancesData) {
        const userTokenData = userTokenBalanceMap[contractAddress];
        if (userTokenData) {
          // User has this token
          balance = userTokenData.balance;
          balanceFormatted = formatBalance(balance, userTokenData.decimals);
          balanceUsd = calculateUsdValue(balance, userTokenData.decimals, priceUsd);
          tokenIcon = userTokenData.icon || '';
        } else {
          // User doesn't have this token, but wallet is connected - show 0
          balance = '0';
          balanceFormatted = '0';
          balanceUsd = '0.00';
        }
      }
      
      return {
        accountId: contractAddress,
        symbol: oneClickToken.symbol,
        name: displayName,
        icon: tokenIcon,
        balance,
        balanceFormatted,
        balanceUsd,
        decimals: oneClickToken.decimals,
        priceUsd,
      };
    });
  }, [oneClickTokens, userTokenBalanceMap, nativeNearBalance, isWalletConnected, isLoadingBalancesData]);

  // Filter tokens based on search query
  const filteredTokens = useMemo(() => {
    if (!searchQuery.trim()) return tokens;

    const query = searchQuery.toLowerCase();
    return tokens.filter(
      (token) =>
        token.name.toLowerCase().includes(query) ||
        token.symbol.toLowerCase().includes(query) ||
        token.accountId.toLowerCase().includes(query)
    );
  }, [tokens, searchQuery]);

  const handleTokenSelect = (token: ProcessedToken) => {
    onSelectToken(token);
    onOpenChange(false);
  };
  
  const isLoading = isLoadingOneClick;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[500px] h-[600px] p-0 gap-0 flex flex-col"
        showCloseButton={false}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <img src={PingIcon} alt="Ping" className="w-8 h-8" />
            <DialogTitle className="text-xl font-normal">
              Select Asset and Network
            </DialogTitle>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Search Bar and Network Selector */}
        <div className="px-6 pt-4 pb-3">
          <div className="flex items-center gap-3">
            {/* Search Bar */}
            <div className="relative flex-1">
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <SearchIcon />
              </div>
              <Input
                placeholder="Search name or paste address"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-12 bg-background"
              />
            </div>

            {/* Network Selector */}
            <button
              onClick={() => setShowNetworkModal(true)}
              className="flex items-center gap-2 px-4 h-12 bg-background rounded-lg border border-border hover:bg-muted/30 transition-all"
            >
              {networkIcons[selectedNetwork] ? (
                <img
                  src={networkIcons[selectedNetwork]}
                  alt={selectedNetwork}
                  className="w-5 h-5 rounded-full"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#00C08B] to-[#00A872] flex items-center justify-center">
                  <span className="text-white text-xs font-bold">
                    {selectedNetwork.charAt(0)}
                  </span>
                </div>
              )}
              <span className="text-sm font-medium text-foreground">{selectedNetwork}</span>
              <ChevronDownIcon />
            </button>
          </div>
        </div>

        {/* Token List */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Loading tokens...</p>
            </div>
          ) : filteredTokens.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <p className="text-sm text-muted-foreground">
                {searchQuery ? 'No tokens found' : 'No tokens available'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTokens.map((token) => {
                // Match by accountId or by symbol if accountId is NATIVE/wrap.near
                const isSelected = token.accountId === selectedTokenAccountId ||
                  (token.accountId === 'NATIVE' && selectedTokenAccountId === 'wrap.near') ||
                  (token.accountId === 'wrap.near' && selectedTokenAccountId === 'NATIVE');

                return (
                  <button
                    key={`${token.accountId}-${token.symbol}`}
                    onClick={() => handleTokenSelect(token)}
                    className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${
                      isSelected
                        ? 'bg-primary/10 border-primary/50'
                        : 'bg-muted/10 border-border hover:bg-muted/30 hover:border-muted-foreground/30'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Token Icon */}
                      {token.icon ? (
                        <img
                          src={token.icon}
                          alt={token.symbol}
                          className="w-10 h-10 rounded-full"
                          onError={(e) => {
                            // Fallback to colored circle with symbol
                            e.currentTarget.style.display = 'none';
                            const fallback = e.currentTarget.nextElementSibling;
                            if (fallback) {
                              (fallback as HTMLElement).style.display = 'flex';
                            }
                          }}
                        />
                      ) : null}
                      <div
                        className="w-10 h-10 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#A78BFA] flex items-center justify-center"
                        style={{ display: token.icon ? 'none' : 'flex' }}
                      >
                        <span className="text-white text-sm font-bold">
                          {/* if token symbol is wnear or wNEAR, show NEAR */}
                          {token.symbol === 'wnear' || token.symbol === 'wNEAR' ? 'NEAR' : token.symbol.substring(0, 2).toUpperCase()} 
                        </span>
                      </div>

                      {/* Token Info */}
                      <div className="flex flex-col items-start">
                        <span className="text-base font-medium text-foreground">
                          {token.name}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {token.symbol === 'wnear' || token.symbol === 'wNEAR' ? 'NEAR' : token.symbol}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Balance and USD Value - Show if wallet is connected and balance is loaded (even if 0) */}
                      {isWalletConnected && !isLoadingBalancesData && token.balanceFormatted !== undefined && token.balanceUsd !== undefined ? (
                        <div className="flex flex-col items-end">
                          <span className="text-base font-medium text-foreground">
                            {token.balanceFormatted}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            ${token.balanceUsd}
                          </span>
                        </div>
                      ) : null}

                      {/* Check Icon if selected */}
                      {isSelected && (
                        <div className="w-5 h-5">
                          <CheckIcon />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>

      {/* Network Selection Modal */}
      <NetworkSelectionModal
        open={showNetworkModal}
        onOpenChange={setShowNetworkModal}
        selectedNetwork={selectedNetwork}
        onSelectNetwork={setSelectedNetwork}
      />
    </Dialog>
  );
};
