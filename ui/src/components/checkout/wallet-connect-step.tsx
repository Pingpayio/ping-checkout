import { useState } from 'react';
import { WalletIcon, CloseIcon } from './icons';
import { PoweredByPing } from './powered-by-ping';
import { TotalPaymentDisplay } from './total-payment-display';
import { DeFiPaymentInfo } from './defi-payment-info';
import { getAssetSymbol } from '@/utils/format';
import { AssetNetworkSelector } from './asset-network-selector';
import { AssetSelectionModal } from './asset-selection-modal';
import { type ProcessedToken } from '@/hooks/use-user-tokens';
import UsdcIcon from '@/assets/icons/usdc.png';
import NearIcon from '@/assets/icons/Near.png';

interface WalletConnectStepProps {
  amount: string;
  assetId: string;
  accountId: string | null;
  isConnectingWallet: boolean;
  isSigningInWithNear: boolean;
  selectedPaymentAssetId: string;
  onConnect: () => void;
  onSignIn: () => void;
  onBack: () => void;
  onAssetChange: (assetId: string) => void;
}

export const WalletConnectStep = ({
  amount,
  assetId,
  accountId,
  isConnectingWallet,
  isSigningInWithNear,
  selectedPaymentAssetId,
  onConnect,
  onSignIn,
  onBack,
  onAssetChange,
}: WalletConnectStepProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Get display info for selected asset
  const getSelectedTokenInfo = () => {
    if (selectedPaymentAssetId === 'nep141:wrap.near') {
      return {
        symbol: 'NEAR',
        icon: NearIcon,
      };
    } else if (selectedPaymentAssetId === 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1') {
      return {
        symbol: 'USDC',
        icon: UsdcIcon,
      };
    }
    // Default to NEAR
    return {
      symbol: 'NEAR',
      icon: NearIcon,
    };
  };

  const selectedToken = getSelectedTokenInfo();

  // Handler for token selection
  const handleTokenSelect = (token: ProcessedToken) => {
    if (token.accountId === 'NATIVE') {
      onAssetChange('nep141:wrap.near');
    } else {
      onAssetChange(`nep141:${token.accountId}`);
    }
  };

  return (
    <div
      className="flex flex-col gap-[21px]"
      style={{
        padding: 'var(--widget-padding)',
        backgroundColor: 'var(--widget-fill)',
        border: '1px solid var(--widget-stroke)',
        borderRadius: 'var(--radius-widget)',
        width: '500px',
        minHeight: '489px'
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
            <span className="text-xl font-normal" style={{ color: 'var(--font-primary)' }}>
              {selectedToken.symbol}
            </span>
            <AssetNetworkSelector
              symbol={selectedToken.symbol}
              icon={selectedToken.icon}
              network="NEAR"
              iconSize={26}
              onClick={() => setIsModalOpen(true)}
            />
          </div>
        </div>
      </div>

      {/* Connect Wallet Button */}
      <button
        onClick={!accountId ? onConnect : onSignIn}
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
            : !accountId
              ? "Connect Wallet"
              : `Sign in as ${accountId}`}
        </span>
      </button>

      {/* DeFi Payment Info */}
      <DeFiPaymentInfo />

      {/* Powered by PING Footer */}
      <PoweredByPing />

      {/* Asset Selection Modal */}
      <AssetSelectionModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        accountId={undefined}
        onSelectToken={handleTokenSelect}
        selectedTokenAccountId={
          selectedPaymentAssetId === 'nep141:wrap.near'
            ? 'NATIVE'
            : selectedPaymentAssetId.replace('nep141:', '')
        }
      />
    </div>
  );
};