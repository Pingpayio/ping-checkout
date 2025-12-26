import { useState, useMemo } from 'react';
import { getAssetSymbol, formatAssetAmount } from '@/utils/format';
import { ChevronDownIcon, CloseIcon, InfoIcon, ErrorIcon, WalletIcon } from './icons';
import { PoweredByPing } from './powered-by-ping';
import { TotalPaymentDisplay } from './total-payment-display';
import { DeFiPaymentInfo } from './defi-payment-info';
import { PaymentButton } from '@/components/checkout/payment-button';
import { usePreparePayment } from '@/integrations/api/payments';
import { AssetNetworkSelector } from './asset-network-selector';
import { AssetSelectionModal } from './asset-selection-modal';
import { type ProcessedToken } from '@/hooks/use-user-tokens';
import { useOneClickTokensByChain } from '@/hooks/use-oneclick-tokens';
import { useGetUserTokens, useGetNativeNearBalance } from '@/integrations/api/tokens';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { tokenToAssetFormat } from '@/utils/assets';
import NearIcon from '@/assets/icons/Near.png';

// Format crypto amount to max 8 decimal places, removing trailing zeros
const formatCryptoAmount = (amount: string | number): string => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '0';

  // Format to 8 decimal places max
  const formatted = num.toFixed(8);

  // Remove trailing zeros and unnecessary decimal point
  return formatted.replace(/\.?0+$/, '');
};

interface PaymentAssetSelectionProps {
  amount: string;
  assetId: string;
  selectedPaymentAsset: { amount: string; asset: { chain: string; symbol: string } } | null;
  paymentData: any; // Can be full payment data or just { quote: ... } when not connected
  accountId?: string | null;
  onBack: () => void;
  onAssetChange: (chain: string, symbol: string) => void;
  onPaymentSuccess: () => void;
  // Connect button props (when wallet not connected)
  showConnectButton?: boolean;
  isConnectingWallet?: boolean;
  isSigningInWithNear?: boolean;
  onConnect?: () => void;
  onSignIn?: () => void;
  // Quote loading state (when not connected)
  isQuoteLoading?: boolean;
  isQuoteError?: boolean;
}

export const PaymentAssetSelection = ({
  amount,
  assetId,
  selectedPaymentAsset,
  paymentData,
  accountId: accountIdProp,
  onBack,
  onAssetChange,
  onPaymentSuccess,
  showConnectButton = false,
  isConnectingWallet = false,
  isSigningInWithNear = false,
  onConnect,
  onSignIn,
  isQuoteLoading = false,
  isQuoteError = false,
}: PaymentAssetSelectionProps) => {
  const isConnected = !!accountIdProp;
  
  // If not connected and no asset selected, default to USDC
  const effectiveSelectedAsset = selectedPaymentAsset || (!isConnected ? { amount: '0', asset: { chain: 'NEAR', symbol: 'USDC' } } : null);
  
  // Extract quote from paymentData (can be from full payment or quote-only)
  const quote = paymentData?.quote;
  const preparePayment = usePreparePayment();
  const [showTransactionDetails, setShowTransactionDetails] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Fetch all Intents tokens for NEAR chain
  const { tokens: oneClickTokens } = useOneClickTokensByChain('NEAR');
  
  // Check if wallet is connected
  const isWalletConnected = !!accountIdProp;
  
  // Fetch all user tokens from Intear API (if wallet connected)
  const { data: userTokensData } = useGetUserTokens(
    accountIdProp || undefined,
    isWalletConnected
  );
  
  // Fetch native NEAR balance (if wallet connected)
  const { data: nativeNearBalance } = useGetNativeNearBalance(
    accountIdProp || undefined,
    isWalletConnected
  );
  
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
  
  // Convert Intents tokens to ProcessedToken format with user balances
  const tokens = useMemo(() => {
    if (!oneClickTokens.length) return [];
    
    // Symbol to display name mapping
    const symbolToDisplayName: Record<string, string> = {
      'wnear': 'NEAR',
      'wNEAR': 'NEAR',
      'USDC': 'USD Coin',
      'USDT': 'Tether USD',
    };
    
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
        // Only show balance if wallet is connected and balance > 0
        let balance = '';
        let balanceFormatted = '';
        let balanceUsd = '';
        
        if (isWalletConnected && nativeNearBalance !== undefined) {
          const balanceNum = parseFloat(nativeNearBalance || '0');
          if (balanceNum > 0) {
            balance = nativeNearBalance;
            balanceFormatted = formatBalance(balance, 24);
            balanceUsd = calculateUsdValue(balance, 24, priceUsd);
          }
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
      const userTokenData = userTokenBalanceMap[contractAddress];
      const balance = userTokenData?.balance || '';
      const balanceFormatted = balance ? formatBalance(balance, userTokenData.decimals) : '';
      const balanceUsd = balance ? calculateUsdValue(balance, userTokenData.decimals, priceUsd) : '';
      const tokenIcon = userTokenData?.icon || '';
      
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
  }, [oneClickTokens, userTokenBalanceMap, nativeNearBalance, isWalletConnected]);

  // Find the current selected token from the merged tokens list
  const currentToken = useMemo(() => {
    if (!effectiveSelectedAsset) return undefined;
    
    return tokens.find((token) => {
      // Convert token to asset format for comparison
      const tokenAsset = tokenToAssetFormat(token);
      return (
        tokenAsset.chain === effectiveSelectedAsset.asset.chain &&
        tokenAsset.symbol === effectiveSelectedAsset.asset.symbol
      );
    });
  }, [tokens, effectiveSelectedAsset]);

  // Handler for token selection from modal
  const handleTokenSelect = (token: ProcessedToken) => {
    // Convert ProcessedToken to our asset format (chain + symbol)
    const assetFormat = tokenToAssetFormat(token);
    onAssetChange(assetFormat.chain, assetFormat.symbol);
  };

  return (
    <div
      className="flex flex-col gap-[21px]"
      style={{
        padding: 'var(--widget-padding)',
        backgroundColor: 'var(--widget-fill)',
        border: '1px solid var(--widget-stroke)',
        borderRadius: 'var(--radius-widget)',
        width: '500px'
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-normal" style={{ color: 'var(--font-primary)' }}>Payment</h1>
        <button
          onClick={onBack}
          className="transition-colors"
          style={{ color: 'var(--font-secondary)' }}
        >
          <CloseIcon />
        </button>
      </div>

      {/* Total Payment Section */}
      <TotalPaymentDisplay amount={amount} amountInUsd={quote?.amountInUsd || '0'} assetId={assetId} showIcon variant="small" />

      {/* Pay With Section */}
      <div>
        <h2 
          className="text-base font-normal" 
          style={{ color: 'var(--font-primary)', marginBottom: '9.5px' }}
        >
          Pay With
        </h2>

        {/* Payment Asset Selection */}
        <div
          className="p-4"
          style={{
            backgroundColor: 'var(--elevation-1-fill)',
            border: '1px solid var(--elevation-1-stroke)',
            borderRadius: 'var(--radius-button)'
          }}
        >
          <div className="flex items-center justify-between">
            {(preparePayment.isPending || isQuoteLoading) || (!paymentData && !isQuoteLoading) ? (
              <div className="flex items-center gap-3">
                <LoadingSpinner size={40} />
                <span className="text-xs font-normal" style={{ color: '#FFFFFF99' }}>Getting Quote...</span>
              </div>
            ) : (preparePayment.isError || isQuoteError) ? (
              <div className="flex items-center gap-3">
                <ErrorIcon />
                <div className="flex items-center gap-2">
                  <span className="text-xs font-normal" style={{ color: '#FFFFFF99' }}>No Quote Found.</span>
                  <InfoIcon />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-start">
                <span className="text-xl font-normal" style={{ color: 'var(--font-primary)' }}>
                  {formatCryptoAmount(
                    quote?.amountInFormatted ||
                    (paymentData?.payment ? formatAssetAmount(paymentData.payment.request.asset.amount, paymentData.payment.request.asset.assetId || '') : '0')
                  )}{' '}
                  {/* {currentToken?.name || selectedPaymentAsset?.asset.symbol} */}
                </span>
                {/* USD Value */}
                {quote?.amountInUsd && (
                  <span className="text-sm font-normal" style={{ color: 'var(--font-secondary)' }}>
                    ~${parseFloat(quote.amountInUsd).toFixed(2)} USD
                  </span>
                )}
              </div>
            )}

            <AssetNetworkSelector
              name={currentToken?.name}
              symbol={effectiveSelectedAsset?.asset.symbol || 'USDC'}
              icon={currentToken?.icon}
              network={effectiveSelectedAsset?.asset.chain || 'NEAR'}
              onClick={() => setIsModalOpen(true)}
            />
          </div>
        </div>

        {/* Transaction Details */}
        {paymentData && (
          <>
            {/* Transaction Details Content - Shown directly without card */}
            {showTransactionDetails && (
              <div className="space-y-3 text-sm mt-4">
                {/* Recipient Address - Only show when payment data is available (connected) */}
                {paymentData?.payment?.request?.recipient?.address && (
                  <div className="flex items-center justify-between">
                    <span style={{ color: 'var(--font-secondary)' }}>Recipient Address</span>
                    <div className="flex items-center gap-2">
                      <span className="font-normal font-mono text-xs" style={{ color: 'var(--font-primary)' }}>
                        {paymentData.payment.request.recipient.address.length > 15
                          ? `${paymentData.payment.request.recipient.address.slice(0, 6)}...${paymentData.payment.request.recipient.address.slice(-5)}`
                          : paymentData.payment.request.recipient.address
                        }
                      </span>
                      <button
                        onClick={() => navigator.clipboard.writeText(paymentData.payment.request.recipient.address)}
                        style={{ color: 'var(--font-secondary)' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                      </button>
                    </div>
                  </div>
                )}

                {/* Pricing Rate */}
                {effectiveSelectedAsset && quote?.amountInFormatted && (
                  <div className="flex items-center justify-between">
                    <span style={{ color: 'var(--font-secondary)' }}>Pricing Rate</span>
                    <span className="font-normal" style={{ color: 'var(--font-primary)' }}>
                      1 {getAssetSymbol(assetId)} ≈ {
                        (parseFloat(quote.amountInFormatted) / parseFloat(formatAssetAmount(amount, assetId))).toFixed(4)
                      } {effectiveSelectedAsset.asset.symbol}
                    </span>
                  </div>
                )}

                {/* Max Slippage */}
                <div className="flex items-center justify-between">
                  <span style={{ color: 'var(--font-secondary)' }}>Max Slippage</span>
                  <span className="font-normal" style={{ color: 'var(--font-primary)' }}>1%</span>
                </div>

                {/* Route */}
                <div className="flex items-center justify-between">
                  <span style={{ color: 'var(--font-secondary)' }}>Route</span>
                  <span className="font-normal" style={{ color: 'var(--font-primary)' }}>via NEAR Intents</span>
                </div>

                {/* Horizontal separator before fees */}
                {/* <div className="border-t pt-3 space-y-3" style={{ borderColor: 'var(--widget-stroke)' }}>
                  
                  <div className="flex items-center justify-between">
                    <span style={{ color: 'var(--font-secondary)' }}>Network Fee</span>
                    <span className="font-normal" style={{ color: 'var(--font-primary)' }}>
                      ${paymentData.payment?.feeQuote?.totalFee?.amount
                        ? formatAssetAmount(paymentData.payment.feeQuote.totalFee.amount, paymentData.payment.feeQuote.totalFee.assetId)
                        : '0.06'}
                    </span>
                  </div>

                  
                  <div className="flex items-center justify-between">
                    <span style={{ color: 'var(--font-secondary)' }}>Pingpay Fee</span>
                    <span className="font-normal" style={{ color: 'var(--font-primary)' }}>$0</span>
                  </div>

                  
                  <div className="flex items-center justify-between">
                    <span className="font-medium" style={{ color: 'var(--font-primary)' }}>Total Fee</span>
                    <span className="font-medium" style={{ color: 'var(--font-primary)' }}>
                      ${paymentData.payment?.feeQuote?.totalFee?.amount
                        ? formatAssetAmount(paymentData.payment.feeQuote.totalFee.amount, paymentData.payment.feeQuote.totalFee.assetId)
                        : '0.06'}
                    </span>
                  </div>
                </div> */}
              </div>
            )}

            {/* Transaction Details Toggle Button - Aligned to the right */}
            <div className="flex flex-col gap-3">
              <div className="flex justify-end mt-4">
                <button
                  onClick={() => setShowTransactionDetails(!showTransactionDetails)}
                  className="flex items-center gap-2 text-sm transition-colors"
                  style={{ color: 'var(--brand-purple)' }}
                >
                  <span>Transaction Details</span>
                  <div className={`transform transition-transform ${showTransactionDetails ? 'rotate-180' : ''}`}>
                    <ChevronDownIcon />
                  </div>
                </button>
              </div>
              {/* Horizontal line after Transaction Details */}
              <div className="border-t" style={{ borderColor: 'var(--widget-stroke)' }} />
            </div>
          </>
        )}
      </div>

      {/* Connect Button (when wallet not connected) or Pay Button (when connected) */}
      {showConnectButton && !isConnected ? (
        <button
          onClick={accountIdProp ? onSignIn : onConnect}
          disabled={isConnectingWallet || isSigningInWithNear}
          className="flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            width: '450px',
            height: '58px',
            borderRadius: '8px',
            paddingTop: '8px',
            paddingRight: '16px',
            paddingBottom: '8px',
            paddingLeft: '16px',
            backgroundColor: 'var(--brand-purple)',
            color: 'var(--font-purple-button)'
          }}
        >
          <WalletIcon />
          <span className="text-base font-normal">
            {isConnectingWallet || isSigningInWithNear
              ? "Connecting..."
              : accountIdProp
                ? `Sign in as ${accountIdProp}`
                : "Connect Wallet"}
          </span>
        </button>
      ) : paymentData && effectiveSelectedAsset && isConnected ? (
        <PaymentButton
          paymentData={paymentData}
          selectedPaymentAsset={effectiveSelectedAsset}
          onSuccess={onPaymentSuccess}
        />
      ) : preparePayment.isError ? (
        <button
          disabled
          className="flex items-center justify-center gap-2 cursor-not-allowed transition-all duration-200"
          style={{
            width: '450px',
            height: '58px',
            borderRadius: '8px',
            paddingTop: '8px',
            paddingRight: '16px',
            paddingBottom: '8px',
            paddingLeft: '16px',
            background: 'linear-gradient(97.34deg, rgba(175, 158, 249, 0.6) 0%, rgba(196, 167, 255, 0.6) 100%)',
            opacity: 1,
            color: 'var(--font-purple-button)'
          }}
        >
          <span className="text-base font-normal">
            No Liquidity for this Pair
          </span>
        </button>
      ) : (
        <button
          disabled
          className="flex items-center justify-center gap-2 cursor-not-allowed transition-all duration-200"
          style={{
            width: '450px',
            height: '58px',
            borderRadius: '8px',
            paddingTop: '8px',
            paddingRight: '16px',
            paddingBottom: '8px',
            paddingLeft: '16px',
            background: 'linear-gradient(97.34deg, rgba(175, 158, 249, 0.6) 0%, rgba(196, 167, 255, 0.6) 100%)',
            opacity: 1,
            color: 'var(--font-purple-button)'
          }}
        >
          <span className="text-base font-normal">
            Getting Quote
          </span>
        </button>
      )}

      {/* DeFi Payment Info */}
      <DeFiPaymentInfo />

      {/* Powered by PING Footer */}
      <PoweredByPing />

      {/* Asset Selection Modal */}
      <AssetSelectionModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        accountId={accountIdProp || undefined}
        onSelectToken={handleTokenSelect}
        selectedTokenAccountId={currentToken?.accountId}
      />
    </div>
  );
};