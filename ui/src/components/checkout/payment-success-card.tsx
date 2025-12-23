import { PoweredByPing } from './powered-by-ping';

interface PaymentSuccessCardProps {
  paymentAmount: string;
  asset: string;
  network: string;
  recipientAddress: string;
  pricingRate: string;
  networkFee: string;
  pingpayFee: string;
  totalFee: string;
  date?: string;
  onViewExplorer?: () => void;
  onClose?: () => void;
}

const CheckmarkIcon = () => (
  <div className="relative w-[100px] h-[100px] flex items-center justify-center">
    {/* Background circle */}
    <div className="absolute inset-0 rounded-full" style={{ backgroundColor: '#5A5474' }}>
      {/* Checkmark */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M30 50L45 65L70 40"
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

export const PaymentSuccessCard = ({
  paymentAmount,
  asset,
  network,
  recipientAddress,
  pricingRate,
  networkFee,
  pingpayFee,
  totalFee,
  date,
  onViewExplorer,
  onClose,
}: PaymentSuccessCardProps) => {
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

      {/* Checkmark Icon */}
      <div className="flex items-center justify-center pt-4">
        <CheckmarkIcon />
      </div>

      {/* Header */}
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-2xl font-semibold leading-tight" style={{ color: 'var(--font-primary)' }}>
          Payment Successful!
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

        {/* Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-normal" style={{ color: 'var(--font-secondary)' }}>Status</span>
          <span className="text-sm font-medium text-green-500">Confirmed</span>
        </div>

        {/* Date */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-normal" style={{ color: 'var(--font-secondary)' }}>Date</span>
          <span className="text-sm font-normal" style={{ color: 'var(--font-primary)' }}>{displayDate}</span>
        </div>
      </div>

      {/* View on Explorer Button */}
      {onViewExplorer && (
        <button
          onClick={onViewExplorer}
          className="flex h-[58px] w-full items-center justify-center gap-2 px-4 py-2 transition-all duration-200"
          style={{
            background: 'linear-gradient(97.34deg, #AF9EF9 0%, #C4A7FF 100%)',
            borderRadius: 'var(--radius-button)',
            color: 'var(--font-purple-button)'
          }}
        >
          <span className="text-base font-normal">
            View on Explorer
          </span>
        </button>
      )}

      {/* Powered by PING Footer */}
      <PoweredByPing />
    </div>
  );
};
