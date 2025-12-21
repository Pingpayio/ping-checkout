import { WalletIcon, CloseIcon } from './icons';
import { PoweredByPing } from './powered-by-ping';
import { TotalPaymentDisplay } from './total-payment-display';
import { DeFiPaymentInfo } from './defi-payment-info';

interface WalletConnectStepProps {
  amount: string;
  assetId: string;
  accountId: string | null;
  isConnectingWallet: boolean;
  isSigningInWithNear: boolean;
  onConnect: () => void;
  onSignIn: () => void;
  onBack: () => void;
}

export const WalletConnectStep = ({
  amount,
  assetId,
  accountId,
  isConnectingWallet,
  isSigningInWithNear,
  onConnect,
  onSignIn,
  onBack
}: WalletConnectStepProps) => {
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

      {/* Connect Wallet Button */}
      <button
        onClick={!accountId ? onConnect : onSignIn}
        disabled={isConnectingWallet || isSigningInWithNear}
        className="flex h-[58px] items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-b from-[#af9ef9] to-[#c4a7ff] hover:from-[#9f8ef9] hover:to-[#b497ff] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <WalletIcon />
        <span className="text-base font-normal text-[#3d315e]">
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
    </div>
  );
};