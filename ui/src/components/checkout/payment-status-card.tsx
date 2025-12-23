import { PoweredByPing } from './powered-by-ping';

interface PaymentStatusCardProps {
  paymentAmount: string;
  asset: string;
  network: string;
  recipientAddress: string;
  pricingRate: string;
  networkFee: string;
  pingpayFee: string;
  totalFee: string;
}

const LoadingSpinner = () => (
  <div className="relative w-[100px] h-[100px] flex items-center justify-center">
    {/* Background circle */}
    <div className="absolute inset-0 rounded-full" style={{ backgroundColor: '#5A5474' }}>
      {/* Inner static circle */}
      <div className="absolute inset-[20px] rounded-full border-[3px]" style={{ borderColor: 'rgba(255, 255, 255, 0.2)' }} />
      {/* Spinning gradient arc */}
      <svg className="absolute inset-0 w-full h-full animate-spin" style={{ animationDuration: '1.5s' }}>
        <circle
          cx="50"
          cy="50"
          r="30"
          fill="none"
          stroke="url(#spinner-gradient)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="40 150"
        />
        <defs>
          <radialGradient id="spinner-gradient" cx="50%" cy="0%" r="50%">
            <stop offset="0%" stopColor="#AB9FF2" />
            <stop offset="100%" stopColor="rgba(255, 255, 255, 0.2)" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  </div>
);

const CopyIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="7" y="7" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
    <path d="M4 13V5C4 4.44772 4.44772 4 5 4H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const ClockIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" fill="none"/>
    <path d="M10 6V10L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export const PaymentStatusCard = ({
  paymentAmount,
  asset,
  network,
  recipientAddress,
  pricingRate,
  networkFee,
  pingpayFee,
  totalFee,
}: PaymentStatusCardProps) => {
  const handleCopyAddress = () => {
    navigator.clipboard.writeText(recipientAddress);
  };

  // Format address for display (show first 5 and last 5 chars)
  const displayAddress = recipientAddress.length > 15
    ? `${recipientAddress.slice(0, 5)}...${recipientAddress.slice(-5)}`
    : recipientAddress;

  return (
    <div
      className="flex flex-col gap-6 max-w-[500px] w-full"
      style={{
        padding: 'var(--widget-padding)',
        backgroundColor: 'var(--widget-fill)',
        border: '1px solid var(--widget-stroke)',
        borderRadius: 'var(--radius-widget)',
        minHeight: '700px'
      }}
    >
      {/* Spinner */}
      <div className="flex items-center justify-center pt-4">
        <LoadingSpinner />
      </div>

      {/* Header */}
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-2xl font-semibold leading-tight" style={{ color: 'var(--font-primary)' }}>
          Processing Your Payment
        </h1>
        <p className="text-sm font-normal" style={{ color: 'var(--font-secondary)' }}>
          Your transaction is being confirmed.
        </p>
      </div>

      {/* Payment Details Section */}
      <div
        className="flex flex-col gap-3 p-4"
        style={{
          backgroundColor: 'var(--elevation-1-fill)',
          border: '1px solid var(--elevation-1-stroke)',
          borderRadius: 'var(--radius-button)'
        }}
      >
        <h2 className="text-base font-medium text-center" style={{ color: 'var(--font-primary)' }}>Payment Details</h2>

        {/* Payment Amount */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-normal" style={{ color: 'var(--font-secondary)' }}>Payment Amount</span>
          <span className="text-sm font-normal" style={{ color: 'var(--font-primary)' }}>{paymentAmount} {asset}</span>
        </div>

        {/* Asset */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-normal" style={{ color: 'var(--font-secondary)' }}>Asset</span>
          <span className="text-sm font-normal" style={{ color: 'var(--font-primary)' }}>{asset}</span>
        </div>

        {/* Network */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-normal" style={{ color: 'var(--font-secondary)' }}>Network</span>
          <span className="text-sm font-normal" style={{ color: 'var(--font-primary)' }}>{network}</span>
        </div>

        {/* Recipient Address */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-normal" style={{ color: 'var(--font-secondary)' }}>Recipient Address</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-normal font-mono" style={{ color: 'var(--font-primary)' }}>{displayAddress}</span>
            <button
              onClick={handleCopyAddress}
              className="transition-colors"
              style={{ color: 'var(--font-secondary)' }}
              aria-label="Copy address"
            >
              <CopyIcon />
            </button>
          </div>
        </div>

        {/* Pricing Rate */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-normal" style={{ color: 'var(--font-secondary)' }}>Pricing Rate</span>
          <span className="text-sm font-normal" style={{ color: 'var(--font-primary)' }}>{pricingRate}</span>
        </div>

        {/* Network Fee */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-normal" style={{ color: 'var(--font-secondary)' }}>Network Fee</span>
          <span className="text-sm font-normal" style={{ color: 'var(--font-primary)' }}>{networkFee}</span>
        </div>

        {/* Pingpay Fee */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-normal" style={{ color: 'var(--font-secondary)' }}>Pingpay Fee</span>
          <span className="text-sm font-normal" style={{ color: 'var(--font-primary)' }}>{pingpayFee}</span>
        </div>

        {/* Total Fee */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-normal" style={{ color: 'var(--font-primary)' }}>Total Fee</span>
          <span className="text-sm font-normal" style={{ color: 'var(--font-primary)' }}>{totalFee}</span>
        </div>
      </div>

      {/* Time Notice */}
      <div className="flex items-center justify-center gap-2" style={{ color: 'var(--font-secondary)' }}>
        <ClockIcon />
        <span className="text-sm font-normal">This can take 0-3 minutes</span>
      </div>

      {/* Warning */}
      <p className="text-center text-sm font-normal" style={{ color: 'var(--font-secondary)' }}>
        Do not close this window, transaction is being processed.
      </p>

      {/* Powered by PING Footer */}
      <PoweredByPing />
    </div>
  );
};