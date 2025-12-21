import { ChevronDownIcon } from './icons';

interface AssetNetworkSelectorProps {
  symbol: string;
  icon?: string;
  network?: string;
  onClick: () => void;
}

export const AssetNetworkSelector = ({
  symbol,
  icon,
  network = 'NEAR',
  onClick,
}: AssetNetworkSelectorProps) => {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 bg-muted/20 rounded-lg border border-border hover:bg-muted/40 transition-all"
    >
      {/* Token Icon */}
      {icon ? (
        <img
          src={icon}
          alt={symbol}
          className="w-5 h-5 rounded-full"
          onError={(e) => {
            // Fallback to colored circle with first letter if image fails
            e.currentTarget.style.display = 'none';
            const fallback = e.currentTarget.nextElementSibling;
            if (fallback) {
              (fallback as HTMLElement).style.display = 'flex';
            }
          }}
        />
      ) : null}
      <div
        className="w-5 h-5 rounded-full bg-[#2775CA] flex items-center justify-center"
        style={{ display: icon ? 'none' : 'flex' }}
      >
        <span className="text-white text-xs font-medium">
          {symbol.charAt(0).toUpperCase()}
        </span>
      </div>

      {/* Symbol */}
      <span className="text-sm font-normal text-foreground">
        {symbol}
      </span>

      {/* Network */}
      <span className="text-xs text-muted-foreground">
        {network}
      </span>

      {/* Chevron */}
      <ChevronDownIcon />
    </button>
  );
};
