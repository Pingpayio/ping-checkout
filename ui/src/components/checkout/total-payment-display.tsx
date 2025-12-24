import { formatAssetAmount, getAssetSymbol, getAssetIcon } from '@/utils/format';

interface TotalPaymentDisplayProps {
  amount: string;
  amountInUsd: string;
  assetId: string;
  showIcon?: boolean;
  variant?: 'large' | 'small';
}

export const TotalPaymentDisplay = ({
  amount,
  amountInUsd,
  assetId,
  showIcon = false,
  variant = 'large'
}: TotalPaymentDisplayProps) => {
  const isLarge = variant === 'large';
  const symbol = getAssetSymbol(assetId);
  const formattedAmount = formatAssetAmount(amount, assetId);
  const assetIcon = getAssetIcon(assetId);
  
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
        <span className={`${isLarge ? 'text-lg' : 'text-base'} font-semibold`} style={{ color: 'var(--font-primary)' }}>
          Total Payment:
        </span>
        <div className="flex flex-col items-start">
          <div className="flex items-center" style={{ height: '28px' }}>
            {showIcon && assetIcon && (
              <div className="flex items-center justify-center overflow-hidden rounded-full mr-2" style={{ width: '26px', height: '26px' }}>
                <img src={assetIcon} alt={symbol} className="w-full h-full" />
              </div>
            )}
            <span className={`${isLarge ? 'text-xl' : 'text-lg'} font-semibold`} style={{ color: 'var(--font-primary)', lineHeight: '20px' }}>
              {formattedAmount}{' '}
              {symbol}
            </span>
          </div>
          {amountInUsd && (
            <div className="flex flex-col items-end justify-center w-full">
              <span className="text-sm font-normal text-right" style={{ color: 'var(--font-secondary)', lineHeight: '20px' }}>
                ~${parseFloat(amountInUsd).toFixed(2)} USD
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};