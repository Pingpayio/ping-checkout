import { toast } from 'sonner';
import { WalletIcon, CardIcon, DepositIcon } from './icons';
import { PoweredByPing } from './powered-by-ping';
import { TotalPaymentDisplay } from './total-payment-display';

interface PaymentMethodSelectionProps {
  amount: string;
  assetId: string;
  onSelectMethod: (method: 'wallet' | 'card' | 'deposit') => void;
}

export const PaymentMethodSelection = ({
  amount,
  assetId,
  onSelectMethod
}: PaymentMethodSelectionProps) => {
  return (
    <div className="flex flex-col gap-[21px] p-[25px] bg-card rounded-xl border border-border">
      {/* Header */}
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-normal text-foreground">Payment</h1>

        {/* Total Payment Section */}
        <TotalPaymentDisplay amount={amount} assetId={assetId} variant="large" />
      </div>

      {/* Payment Method Buttons */}
      <div className="flex flex-col gap-3">
        <button
          onClick={() => onSelectMethod('wallet')}
          className="flex h-[58px] items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-b from-[#af9ef9] to-[#c4a7ff] hover:from-[#9f8ef9] hover:to-[#b497ff] transition-all duration-200"
        >
          <WalletIcon />
          <span className="text-base font-normal text-[#3d315e]">Pay with Wallet</span>
        </button>

        <div className="flex items-start gap-3">
          <button
            onClick={() => {
              onSelectMethod('card');
              toast.info('Card payment coming soon!');
            }}
            className="flex flex-1 h-10 items-center justify-center gap-2 px-[17px] py-[9px] bg-[#131313eb] rounded-lg border border-border hover:bg-[#1a1a1aeb] transition-all duration-200"
          >
            <CardIcon />
            <span className="text-sm font-normal text-[#ffffffb9]">Pay with Card</span>
          </button>
          <button
            onClick={() => {
              onSelectMethod('deposit');
              toast.info('Deposit payment coming soon!');
            }}
            className="flex h-10 items-center justify-center gap-2 px-[17px] py-[9px] bg-[#131313eb] rounded-lg border border-border hover:bg-[#1a1a1aeb] transition-all duration-200"
          >
            <DepositIcon />
            <span className="text-sm font-normal text-[#ffffffb9]">Pay with Deposit</span>
          </button>
        </div>
      </div>

      {/* Powered by PING Footer */}
      <PoweredByPing />
    </div>
  );
};