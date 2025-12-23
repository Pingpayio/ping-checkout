import { ChevronDownIcon } from './icons';

interface AssetNetworkSelectorProps {
  symbol: string;
  icon?: string;
  network?: string;
  onClick: () => void;
  iconSize?: number;
}

export const AssetNetworkSelector = ({
  symbol,
  icon,
  network = 'NEAR',
  onClick,
  iconSize = 20,
}: AssetNetworkSelectorProps) => {
  return (
    <button
      onClick={onClick}
      className="transition-all flex items-center"
      style={{
        width: '118px',
        height: '42px',
        backgroundColor: 'var(--elevation-2-fill)',
        border: '1px solid var(--elevation-2-stroke)',
        borderRadius: '9999px',
        paddingTop: '11px',
        paddingBottom: '11px',
        paddingLeft: '13px',
        paddingRight: '13px',
        gap: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Token Icon */}
        {icon ? (
          <img
            src={icon}
            alt={symbol}
            className="rounded-full"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const fallback = e.currentTarget.nextElementSibling;
              if (fallback) {
                (fallback as HTMLElement).style.display = 'flex';
              }
            }}
            style={{ width: `${iconSize}px`, height: `${iconSize}px`, maxWidth: `${iconSize}px`, objectFit: 'cover', borderRadius: '9999px' }}
          />
        ) : null}

        <div
          className="rounded-full bg-[#2775CA] flex items-center justify-center"
          style={{ display: icon ? 'none' : 'flex', width: `${iconSize}px`, height: `${iconSize}px`, borderRadius: '9999px' }}
        >
          <span className="text-white text-xs font-medium">
            {symbol.charAt(0).toUpperCase()}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
          <span className="text-sm font-normal" style={{ color: 'var(--font-primary)', textTransform: 'uppercase' }}>
            {symbol}
          </span>
          <span className="text-xs" style={{ color: 'var(--font-secondary)', textTransform: 'uppercase' }}>
            {network}
          </span>
        </div>
      </div>

      <ChevronDownIcon />
    </button>
  );
};
