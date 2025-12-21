import { formatAssetAmount, getAssetSymbol } from '@/utils/format';
import NearIcon from '@/assets/icons/Near.png';

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

  // Only show NEAR icon if the asset is actually NEAR
  const isNear = symbol === 'NEAR';

  return (
    <div className="p-[13px] bg-muted/20 rounded-lg border border-border">
      <div className="flex items-center justify-between">
        <span className={`${isLarge ? 'text-lg' : 'text-base'} font-normal text-foreground`}>
          Total Payment:
        </span>
        <div className="flex items-center gap-2">
          {showIcon && isNear && <img src={NearIcon} alt="NEAR" className="w-6 h-6" />}
          <span className={`${isLarge ? 'text-xl' : 'text-lg'} font-normal text-foreground`}>
            {formattedAmount}{' '}
            {symbol}
          </span>
        </div>
      </div>
    </div>
  );
};