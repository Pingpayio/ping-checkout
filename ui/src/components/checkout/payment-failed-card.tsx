import { PoweredByPing } from './powered-by-ping';

interface PaymentFailedCardProps {
  paymentAmount: string;
  asset: string;
  network: string;
  recipientAddress: string;
  pricingRate?: string;
  networkFee?: string;
  pingpayFee?: string;
  totalFee?: string;
  date?: string;
  errorMessage?: string;
  onClose?: () => void;
}

const ErrorIcon = () => (
  <div className="relative w-[100px] h-[100px] flex items-center justify-center">
    {/* Background circle */}
    <div className="absolute inset-0 rounded-full" style={{ backgroundColor: '#5A5474' }}>
      {/* X mark */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M35 35L65 65M35 65L65 35"
          stroke="#AF9EF9"
          strokeWidth="5.33"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
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

const CloseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export const PaymentFailedCard = ({
  paymentAmount,
  asset,
  network,
  recipientAddress,
  pricingRate,
  networkFee,
  pingpayFee,
  totalFee,
  date,
  errorMessage,
  onClose,
}: PaymentFailedCardProps) => {
  const handleCopyAddress = () => {
    navigator.clipboard.writeText(recipientAddress);
  };

  // Format address for display (show first 5 and last 5 chars)
  const displayAddress = recipientAddress.length > 15
    ? `${recipientAddress.slice(0, 5)}...${recipientAddress.slice(-5)}`
    : recipientAddress;

  // Format current date/time if not provided
  const displayDate = date || new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).replace(',', ' -');

  return (
    <div
      className="flex flex-col gap-6 max-w-[500px] w-full relative"
      style={{
        padding: 'var(--widget-padding)',
        backgroundColor: 'var(--widget-fill)',
        border: '1px solid var(--widget-stroke)',
        borderRadius: 'var(--radius-widget)',
      }}
    >
      {/* Close Button */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 transition-colors"
          style={{ color: 'var(--font-secondary)' }}
          aria-label="Close"
        >
          <CloseIcon />
        </button>
      )}

      {/* Error Icon */}
      <div className="flex items-center justify-center pt-4">
        <ErrorIcon />
      </div>

      {/* Header */}
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-2xl font-semibold leading-tight" style={{ color: 'var(--font-primary)' }}>
          Payment Failed
        </h1>
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
          <span className="text-sm font-normal" style={{ color: 'var(--font-primary)' }}>-</span>
        </div>

        {/* Network Fee */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-normal" style={{ color: 'var(--font-secondary)' }}>Network Fee</span>
          <span className="text-sm font-normal" style={{ color: 'var(--font-primary)' }}>-</span>
        </div>

        {/* Pingpay Fee */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-normal" style={{ color: 'var(--font-secondary)' }}>Pingpay Fee</span>
          <span className="text-sm font-normal" style={{ color: 'var(--font-primary)' }}>-</span>
        </div>

        {/* Total Fee */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-normal" style={{ color: 'var(--font-primary)' }}>Total Fee</span>
          <span className="text-sm font-normal" style={{ color: 'var(--font-primary)' }}>-</span>
        </div>

        {/* Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-normal" style={{ color: 'var(--font-secondary)' }}>Status</span>
          <span className="text-sm font-medium text-red-500">Failed</span>
        </div>

        {/* Date */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-normal" style={{ color: 'var(--font-secondary)' }}>Date</span>
          <span className="text-sm font-normal" style={{ color: 'var(--font-primary)' }}>{displayDate}</span>
        </div>
      </div>

      {/* Error Messages */}
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-sm font-normal" style={{ color: 'var(--font-secondary)' }}>
          {errorMessage || 'Your payment failed unexpectedly. You will be refunded.'}
        </p>
        <p className="text-sm font-normal" style={{ color: 'var(--font-secondary)' }}>
          Please go back to the previous step and try payment again.
        </p>
      </div>

      {/* Powered by PING Footer */}
      <PoweredByPing />
    </div>
  );
};
