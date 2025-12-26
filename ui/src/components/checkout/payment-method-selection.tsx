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
    <div
      className="flex flex-col gap-[21px]"
      style={{
        padding: 'var(--widget-padding)',
        backgroundColor: 'var(--widget-fill)',
        border: '1px solid var(--widget-stroke)',
        borderRadius: 'var(--radius-widget)',
        width: '500px',
        minHeight: '344px'
      }}
    >
      {/* Header */}
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-normal" style={{ color: 'var(--font-primary)' }}>Payment</h1>

        {/* Total Payment Section */}
        <TotalPaymentDisplay amount={amount} amountInUsd={''} assetId={assetId} showIcon={true} variant="large" />
      </div>

      {/* Payment Method Buttons */}
      <div className="flex flex-col gap-3">
        <button
          onClick={() => onSelectMethod('wallet')}
          className="flex h-[58px] items-center justify-center transition-all duration-200"
          style={{
            borderRadius: '8px',
            backgroundColor: 'var(--brand-purple)',
            color: 'var(--font-purple-button)',
            paddingTop: '8px',
            paddingRight: '16px',
            paddingBottom: '8px',
            paddingLeft: '16px',
            gap: '8px'
          }}
        >
          <WalletIcon />
          <span className="text-base font-normal">Pay with Wallet</span>
        </button>

        <div className="flex gap-3">
          <button
            onClick={() => {
              onSelectMethod('card');
              toast.info('Card payment coming soon!');
            }}
            className="flex flex-1 h-10 items-center justify-center gap-2 px-[17px] py-[9px] transition-all duration-200"
            style={{
              borderRadius: 'var(--radius-button)',
              backgroundColor: 'var(--elevation-1-fill)',
              border: '1px solid var(--elevation-1-stroke)',
              color: 'var(--font-secondary)'
            }}
          >
            <CardIcon />
            <span className="text-sm font-normal">Pay with Card</span>
          </button>
          <button
            onClick={() => {
              onSelectMethod('deposit');
              toast.info('Deposit payment coming soon!');
            }}
            className="flex flex-1 h-10 items-center justify-center gap-2 px-[17px] py-[9px] transition-all duration-200"
            style={{
              borderRadius: 'var(--radius-button)',
              backgroundColor: 'var(--elevation-1-fill)',
              border: '1px solid var(--elevation-1-stroke)',
              color: 'var(--font-secondary)'
            }}
          >
            <DepositIcon />
            <span className="text-sm font-normal">Pay with Deposit</span>
          </button>
        </div>
      </div>

      {/* Powered by PING Footer */}
      <PoweredByPing />
    </div>
  );
};