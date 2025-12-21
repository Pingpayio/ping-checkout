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
  <div className="relative w-[80px] h-[80px] flex items-center justify-center">
    {/* Outer ring */}
    <div className="absolute inset-0 rounded-full bg-[#584b7d]">
      {/* Inner circle */}
      <div className="absolute inset-[14px] rounded-full bg-[#4a3d6a] flex items-center justify-center">
        {/* Checkmark */}
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M12 20L18 26L28 14"
            stroke="#a89bc5"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
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
    <div className="flex flex-col gap-6 p-[25px] bg-card rounded-xl border border-border max-w-[500px] w-full relative">
      {/* Close Button */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#a3a3a3] hover:text-foreground transition-colors"
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
        <h1 className="text-2xl font-normal text-foreground leading-tight">
          Payment Successful!
        </h1>
      </div>

      {/* Payment Details Section */}
      <div className="flex flex-col gap-3 p-4 bg-[#1a1a1a] rounded-xl border border-border">
        <h2 className="text-base font-normal text-foreground">Payment Details</h2>

        {/* Payment Amount */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-normal text-[#a3a3a3]">Payment Amount</span>
          <span className="text-sm font-normal text-foreground">{paymentAmount}</span>
        </div>

        {/* Asset */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-normal text-[#a3a3a3]">Asset</span>
          <span className="text-sm font-normal text-foreground">{asset}</span>
        </div>

        {/* Network */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-normal text-[#a3a3a3]">Network</span>
          <span className="text-sm font-normal text-foreground">{network}</span>
        </div>

        {/* Recipient Address */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-normal text-[#a3a3a3]">Recipient Address</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-normal text-foreground font-mono">{displayAddress}</span>
            <button
              onClick={handleCopyAddress}
              className="text-[#a3a3a3] hover:text-foreground transition-colors"
              aria-label="Copy address"
            >
              <CopyIcon />
            </button>
          </div>
        </div>

        {/* Pricing Rate */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-normal text-[#a3a3a3]">Pricing Rate</span>
          <span className="text-sm font-normal text-foreground">{pricingRate}</span>
        </div>

        {/* Network Fee */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-normal text-[#a3a3a3]">Network Fee</span>
          <span className="text-sm font-normal text-foreground">{networkFee}</span>
        </div>

        {/* Pingpay Fee */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-normal text-[#a3a3a3]">Pingpay Fee</span>
          <span className="text-sm font-normal text-foreground">{pingpayFee}</span>
        </div>

        {/* Total Fee */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="text-sm font-medium text-foreground">Total Fee</span>
          <span className="text-sm font-medium text-foreground">{totalFee}</span>
        </div>

        {/* Status */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="text-sm font-normal text-[#a3a3a3]">Status</span>
          <span className="text-sm font-medium text-green-500">Confirmed</span>
        </div>

        {/* Date */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-normal text-[#a3a3a3]">Date</span>
          <span className="text-sm font-normal text-foreground">{displayDate}</span>
        </div>
      </div>

      {/* View on Explorer Button */}
      {onViewExplorer && (
        <button
          onClick={onViewExplorer}
          className="flex h-[58px] w-full items-center justify-center gap-2 px-4 py-2 rounded-lg transition-all duration-200"
          style={{
            background: 'linear-gradient(97.34deg, #AF9EF9 0%, #C4A7FF 100%)'
          }}
        >
          <span className="text-base font-normal text-[#3d315e]">
            View on Explorer
          </span>
        </button>
      )}

      {/* Powered by PING Footer */}
      <PoweredByPing />
    </div>
  );
};
