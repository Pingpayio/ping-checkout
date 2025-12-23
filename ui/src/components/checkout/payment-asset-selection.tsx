import { useState } from 'react';
import { getAssetSymbol, formatAssetAmount } from '@/utils/format';
import { ChevronDownIcon, CloseIcon, InfoIcon, ErrorIcon } from './icons';
import { PoweredByPing } from './powered-by-ping';
import { TotalPaymentDisplay } from './total-payment-display';
import { DeFiPaymentInfo } from './defi-payment-info';
import { PaymentButton } from '@/components/checkout/payment-button';
import { usePreparePayment } from '@/integrations/api/payments';
import { AssetNetworkSelector } from './asset-network-selector';
import { AssetSelectionModal } from './asset-selection-modal';
import { useUserTokens, type ProcessedToken } from '@/hooks/use-user-tokens';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

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
  paymentData: any;
  accountId?: string | null;
  onBack: () => void;
  onAssetChange: (chain: string, symbol: string) => void;
  onPaymentSuccess: () => void;
}

export const PaymentAssetSelection = ({
  amount,
  assetId,
  selectedPaymentAsset,
  paymentData,
  accountId: accountIdProp,
  onBack,
  onAssetChange,
  onPaymentSuccess
}: PaymentAssetSelectionProps) => {
  const preparePayment = usePreparePayment();
  const [showTransactionDetails, setShowTransactionDetails] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { tokens } = useUserTokens(accountIdProp || undefined);

  // Find the current selected token from the tokens list
  const currentToken = tokens.find((token) => {
    if (token.accountId === 'NATIVE') {
      // Native NEAR - check if selected asset is wrap.near
      return selectedPaymentAsset?.assetId === 'nep141:wrap.near';
    }
    return `nep141:${token.accountId}` === selectedPaymentAsset?.assetId;
  });

  // Handler for token selection from modal
  const handleTokenSelect = (token: ProcessedToken) => {
    if (token.accountId === 'NATIVE') {
      // For native NEAR, use wrap.near as the asset ID
      onAssetChange('nep141:wrap.near');
    } else {
      onAssetChange(`nep141:${token.accountId}`);
    }
  };

  // Log payment data for debugging
  console.log('[PaymentAssetSelection] Full paymentData:', paymentData);
  console.log('[PaymentAssetSelection] Quote details:', paymentData?.quote);
  console.log('[PaymentAssetSelection] Payment details:', paymentData?.payment);

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
      <TotalPaymentDisplay amount={amount} assetId={assetId} showIcon variant="small" />

      {/* Pay With Section */}
      <div className="space-y-3">
        <h2 className="text-base font-normal" style={{ color: 'var(--font-primary)' }}>Pay With</h2>

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
            {preparePayment.isPending || !paymentData ? (
              <div className="flex items-center gap-3">
                <LoadingSpinner size={40} />
                <span className="text-xs font-normal" style={{ color: '#FFFFFF99' }}>Getting Quote...</span>
              </div>
            ) : preparePayment.isError ? (
              <div className="flex items-center gap-3">
                <ErrorIcon />
                <div className="flex items-center gap-2">
                  <span className="text-xs font-normal" style={{ color: '#FFFFFF99' }}>No Quote Found.</span>
                  <InfoIcon />
                </div>
              </div>
            ) : (
              <span className="text-xl font-normal" style={{ color: 'var(--font-primary)' }}>
                {formatCryptoAmount(
                  paymentData.quote?.amountInFormatted ||
                  formatAssetAmount(paymentData.payment.request.asset.amount, paymentData.payment.request.asset.assetId || '')
                )}{' '}
                {selectedPaymentAsset?.asset.symbol}
              </span>
            )}

            <AssetNetworkSelector
              symbol={selectedPaymentAsset ? getAssetSymbol(selectedPaymentAsset.assetId) : 'USDC'}
              icon={currentToken?.icon}
              network="NEAR"
              onClick={() => setIsModalOpen(true)}
            />
          </div>
        </div>

        {/* Transaction Details */}
        {paymentData && (
          <>
            {/* Transaction Details Content - Shown directly without card */}
            {showTransactionDetails && (
              <div className="space-y-3 text-sm">
                {/* Recipient Address */}
                {paymentData.payment?.request?.recipient?.address && (
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
                {selectedPaymentAsset && paymentData.quote?.amountInFormatted && (
                  <div className="flex items-center justify-between">
                    <span style={{ color: 'var(--font-secondary)' }}>Pricing Rate</span>
                    <span className="font-normal" style={{ color: 'var(--font-primary)' }}>
                      1 {getAssetSymbol(assetId)} ≈ {
                        (parseFloat(paymentData.quote.amountInFormatted) / parseFloat(formatAssetAmount(amount, assetId))).toFixed(4)
                      } {selectedPaymentAsset.asset.symbol}
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
                <div className="border-t pt-3 space-y-3" style={{ borderColor: 'var(--widget-stroke)' }}>
                  {/* Network Fee */}
                  <div className="flex items-center justify-between">
                    <span style={{ color: 'var(--font-secondary)' }}>Network Fee</span>
                    <span className="font-normal" style={{ color: 'var(--font-primary)' }}>
                      ${paymentData.payment?.feeQuote?.totalFee?.amount
                        ? formatAssetAmount(paymentData.payment.feeQuote.totalFee.amount, paymentData.payment.feeQuote.totalFee.assetId)
                        : '0.06'}
                    </span>
                  </div>

                  {/* Pingpay Fee */}
                  <div className="flex items-center justify-between">
                    <span style={{ color: 'var(--font-secondary)' }}>Pingpay Fee</span>
                    <span className="font-normal" style={{ color: 'var(--font-primary)' }}>$0</span>
                  </div>

                  {/* Total Fee */}
                  <div className="flex items-center justify-between">
                    <span className="font-medium" style={{ color: 'var(--font-primary)' }}>Total Fee</span>
                    <span className="font-medium" style={{ color: 'var(--font-primary)' }}>
                      ${paymentData.payment?.feeQuote?.totalFee?.amount
                        ? formatAssetAmount(paymentData.payment.feeQuote.totalFee.amount, paymentData.payment.feeQuote.totalFee.assetId)
                        : '0.06'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Transaction Details Toggle Button - Aligned to the right */}
            <div className="flex flex-col gap-3">
              <div className="flex justify-end">
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

      {/* Pay Button */}
      {paymentData && selectedPaymentAsset ? (
        <PaymentButton
          paymentData={paymentData}
          selectedPaymentAsset={selectedPaymentAsset}
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
        selectedTokenAccountId={selectedPaymentAsset?.assetId.replace('nep141:', '')}
      />
    </div>
  );
};