import { formatAssetAmount, getAssetSymbol, getAssetIcon } from '@/utils/format';

interface TotalPaymentDisplayProps {
  amount: string;
  assetId: string;
  showIcon?: boolean;
  variant?: 'large' | 'small';
}

export const TotalPaymentDisplay = ({
  amount,
  assetId,
  showIcon = false,
  variant = 'large'
}: TotalPaymentDisplayProps) => {
  const isLarge = variant === 'large';
  const symbol = getAssetSymbol(assetId);
  const formattedAmount = formatAssetAmount(amount, assetId);
  const assetIcon = getAssetIcon(assetId);
  console.log(assetIcon);
  
  return (
    <div
      className="p-[13px]"
      style={{
        backgroundColor: 'var(--elevation-2-fill)',
        border: '1px solid var(--elevation-2-stroke)',
        borderRadius: 'var(--radius-button)'
      }}
    >
      <div className="flex items-center justify-between">
        <span className={`${isLarge ? 'text-lg' : 'text-base'} font-normal`} style={{ color: 'var(--font-primary)' }}>
          Total Payment:
        </span>
        <div className="flex items-center gap-2">
          {showIcon && assetIcon && <img src={assetIcon} alt={symbol} className="w-6 h-6" />}
          <span className={`${isLarge ? 'text-xl' : 'text-lg'} font-normal`} style={{ color: 'var(--font-primary)' }}>
            {formattedAmount}{' '}
            {symbol}
          </span>
        </div>
      </div>
    </div>
  );
};