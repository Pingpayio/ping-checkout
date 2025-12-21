import { useState } from 'react';
import { getAssetSymbol, formatAssetAmount } from '@/utils/format';
import { ChevronDownIcon, CloseIcon } from './icons';
import { PoweredByPing } from './powered-by-ping';
import { TotalPaymentDisplay } from './total-payment-display';
import { DeFiPaymentInfo } from './defi-payment-info';
import { PaymentButton } from '@/components/checkout/payment-button';
import { usePreparePayment } from '@/integrations/api/payments';
import { AssetNetworkSelector } from './asset-network-selector';
import { AssetSelectionModal } from './asset-selection-modal';
import { useUserTokens, type ProcessedToken } from '@/hooks/use-user-tokens';

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
  selectedPaymentAsset: { assetId: string; amount: string } | null;
  paymentData: any;
  accountId?: string | null;
  onBack: () => void;
  onAssetChange: (assetId: string) => void;
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

  return (
    <div className="flex flex-col gap-[21px] p-[25px] bg-card rounded-xl border border-border">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-normal text-foreground">Payment</h1>
        <button
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Total Payment Section */}
      <TotalPaymentDisplay amount={amount} assetId={assetId} showIcon variant="small" />

      {/* Pay With Section */}
      <div className="space-y-3">
        <h2 className="text-base font-normal text-foreground">Pay With</h2>

        {/* Payment Asset Selection */}
        <div className="p-4 bg-background rounded-lg border border-border">
          <div className="flex items-center justify-between">
            {preparePayment.isPending || !paymentData ? (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#5A5474] flex items-center justify-center">
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                <span className="text-base font-normal text-foreground">Getting Quote...</span>
              </div>
            ) : (
              <span className="text-xl font-normal text-foreground">
                {formatCryptoAmount(
                  paymentData.quote?.amountInFormatted ||
                  formatAssetAmount(paymentData.payment.request.asset.amount, selectedPaymentAsset?.assetId || '')
                )}{' '}
                {selectedPaymentAsset && getAssetSymbol(selectedPaymentAsset.assetId)}
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
                    <span className="text-muted-foreground">Recipient Address</span>
                    <div className="flex items-center gap-2">
                      <span className="text-foreground font-normal font-mono text-xs">
                        {paymentData.payment.request.recipient.address.length > 15
                          ? `${paymentData.payment.request.recipient.address.slice(0, 6)}...${paymentData.payment.request.recipient.address.slice(-5)}`
                          : paymentData.payment.request.recipient.address
                        }
                      </span>
                      <button
                        onClick={() => navigator.clipboard.writeText(paymentData.payment.request.recipient.address)}
                        className="text-muted-foreground hover:text-foreground"
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
                    <span className="text-muted-foreground">Pricing Rate</span>
                    <span className="text-foreground font-normal">
                      1 {getAssetSymbol(assetId)} ≈ {
                        (parseFloat(paymentData.quote.amountInFormatted) / parseFloat(formatAssetAmount(amount, assetId))).toFixed(4)
                      } {getAssetSymbol(selectedPaymentAsset.assetId)}
                    </span>
                  </div>
                )}

                {/* Max Slippage */}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Max Slippage</span>
                  <span className="text-foreground font-normal">1%</span>
                </div>

                {/* Route */}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Route</span>
                  <span className="text-foreground font-normal">via NEAR Intents</span>
                </div>

                {/* Horizontal separator before fees */}
                <div className="border-t border-border pt-3 space-y-3">
                  {/* Network Fee */}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Network Fee</span>
                    <span className="text-foreground font-normal">
                      ${paymentData.payment?.feeQuote?.totalFee?.amount
                        ? formatAssetAmount(paymentData.payment.feeQuote.totalFee.amount, paymentData.payment.feeQuote.totalFee.assetId)
                        : '0.06'}
                    </span>
                  </div>

                  {/* Pingpay Fee */}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Pingpay Fee</span>
                    <span className="text-foreground font-normal">$0</span>
                  </div>

                  {/* Total Fee */}
                  <div className="flex items-center justify-between">
                    <span className="text-foreground font-medium">Total Fee</span>
                    <span className="text-foreground font-medium">
                      ${paymentData.payment?.feeQuote?.totalFee?.amount
                        ? formatAssetAmount(paymentData.payment.feeQuote.totalFee.amount, paymentData.payment.feeQuote.totalFee.assetId)
                        : '0.06'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Transaction Details Toggle Button - Aligned to the right */}
            <div className="flex justify-end">
              <button
                onClick={() => setShowTransactionDetails(!showTransactionDetails)}
                className="flex items-center gap-2 text-sm text-[#a78bfa] hover:text-[#c4b5fd] transition-colors"
              >
                <span>Transaction Details</span>
                <div className={`transform transition-transform ${showTransactionDetails ? 'rotate-180' : ''}`}>
                  <ChevronDownIcon />
                </div>
              </button>
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
      ) : (
        <button
          disabled
          className="flex h-[58px] items-center justify-center gap-2 px-4 py-2 rounded-lg cursor-not-allowed transition-all duration-200"
          style={{
            background: 'linear-gradient(97.34deg, rgba(175, 158, 249, 0.6) 0%, rgba(196, 167, 255, 0.6) 100%)'
          }}
        >
          <span className="text-base font-normal text-[#3d315e]">
            Getting Quote
          </span>
        </button>
      )}

      {/* Error state */}
      {preparePayment.isError && !paymentData && (
        <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/20">
          <p className="text-destructive text-sm text-center mb-1">Failed to prepare payment</p>
          <p className="text-xs text-muted-foreground text-center">
            {preparePayment.error instanceof Error
              ? preparePayment.error.message
              : 'Please try again or refresh the page'}
          </p>
        </div>
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