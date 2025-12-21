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
  <div className="relative w-[80px] h-[80px] flex items-center justify-center">
    {/* Outer ring */}
    <div className="absolute inset-0 rounded-full bg-[#584b7d]">
      {/* Spinning gradient arc */}
      <svg className="absolute inset-0 w-full h-full animate-spin" style={{ animationDuration: '1.5s' }}>
        <circle
          cx="40"
          cy="40"
          r="36"
          fill="none"
          stroke="url(#spinner-gradient)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray="120 120"
        />
        <defs>
          <linearGradient id="spinner-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#a89bc5" />
            <stop offset="100%" stopColor="#7b6ba3" />
          </linearGradient>
        </defs>
      </svg>
    </div>
    {/* Inner circle */}
    <div className="relative w-[52px] h-[52px] rounded-full bg-[#4a3d6a] flex items-center justify-center">
      <div className="w-[40px] h-[40px] rounded-full border-[2px] border-[#7b6ba3]" />
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
    <div className="flex flex-col gap-6 p-[25px] bg-card rounded-xl border border-border max-w-[500px] w-full">
      {/* Spinner */}
      <div className="flex items-center justify-center pt-4">
        <LoadingSpinner />
      </div>

      {/* Header */}
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-2xl font-normal text-foreground leading-tight">
          Processing Your Payment
        </h1>
        <p className="text-sm font-normal text-[#a3a3a3]">
          Your transaction is being confirmed.
        </p>
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
      </div>

      {/* Time Notice */}
      <div className="flex items-center justify-center gap-2 text-[#a3a3a3]">
        <ClockIcon />
        <span className="text-sm font-normal">This can take 0-3 minutes</span>
      </div>

      {/* Warning */}
      <p className="text-center text-sm font-normal text-[#a3a3a3]">
        Do not close this window, transaction is being processed.
      </p>

      {/* Powered by PING Footer */}
      <PoweredByPing />
    </div>
  );
};