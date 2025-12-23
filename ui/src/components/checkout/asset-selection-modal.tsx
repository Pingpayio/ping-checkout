import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useUserTokens, type ProcessedToken } from '@/hooks/use-user-tokens';
import { CloseIcon, ChevronDownIcon } from './icons';
import PingIcon from '@/assets/logos/PING_ICON.png';
import { NetworkSelectionModal } from './network-selection-modal';

interface AssetSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string | undefined;
  onSelectToken: (token: ProcessedToken) => void;
  selectedTokenAccountId?: string;
}

const SearchIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M9 17A8 8 0 1 0 9 1a8 8 0 0 0 0 16zM18 18l-4.35-4.35"
      stroke="#AF9EF9"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CheckIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="text-primary"
  >
    <path
      d="M16.667 5L7.5 14.167 3.333 10"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const AssetSelectionModal = ({
  open,
  onOpenChange,
  accountId,
  onSelectToken,
  selectedTokenAccountId,
}: AssetSelectionModalProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState('NEAR');
  const { tokens, isLoading } = useUserTokens(accountId);

  // Filter tokens based on search query
  const filteredTokens = useMemo(() => {
    if (!searchQuery.trim()) return tokens;

    const query = searchQuery.toLowerCase();
    return tokens.filter(
      (token) =>
        token.name.toLowerCase().includes(query) ||
        token.symbol.toLowerCase().includes(query) ||
        token.accountId.toLowerCase().includes(query)
    );
  }, [tokens, searchQuery]);

  const handleTokenSelect = (token: ProcessedToken) => {
    onSelectToken(token);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[500px] h-[600px] p-0 gap-0 flex flex-col"
        showCloseButton={false}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <img src={PingIcon} alt="Ping" className="w-8 h-8" />
            <DialogTitle className="text-xl font-normal">
              Select Asset and Network
            </DialogTitle>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Search Bar and Network Selector */}
        <div className="px-6 pt-4 pb-3">
          <div className="flex items-center gap-3">
            {/* Search Bar */}
            <div className="relative flex-1">
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <SearchIcon />
              </div>
              <Input
                placeholder="Search name or paste address"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-12 bg-background"
              />
            </div>

            {/* Network Selector */}
            <button
              onClick={() => setShowNetworkModal(true)}
              className="flex items-center gap-2 px-4 h-12 bg-background rounded-lg border border-border hover:bg-muted/30 transition-all"
            >
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#00C08B] to-[#00A872] flex items-center justify-center">
                <span className="text-white text-xs font-bold">N</span>
              </div>
              <span className="text-sm font-medium text-foreground">{selectedNetwork}</span>
              <ChevronDownIcon />
            </button>
          </div>
        </div>

        {/* Token List */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Loading tokens...</p>
            </div>
          ) : filteredTokens.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <p className="text-sm text-muted-foreground">
                {searchQuery ? 'No tokens found' : 'No tokens with balance'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTokens.map((token) => {
                const isSelected = token.accountId === selectedTokenAccountId;

                return (
                  <button
                    key={token.accountId}
                    onClick={() => handleTokenSelect(token)}
                    className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${
                      isSelected
                        ? 'bg-primary/10 border-primary/50'
                        : 'bg-muted/10 border-border hover:bg-muted/30 hover:border-muted-foreground/30'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Token Icon */}
                      {token.icon ? (
                        <img
                          src={token.icon}
                          alt={token.symbol}
                          className="w-10 h-10 rounded-full"
                          onError={(e) => {
                            // Fallback to colored circle with symbol
                            e.currentTarget.style.display = 'none';
                            const fallback = e.currentTarget.nextElementSibling;
                            if (fallback) {
                              (fallback as HTMLElement).style.display = 'flex';
                            }
                          }}
                        />
                      ) : null}
                      <div
                        className="w-10 h-10 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#A78BFA] flex items-center justify-center"
                        style={{ display: token.icon ? 'none' : 'flex' }}
                      >
                        <span className="text-white text-sm font-bold">
                          {token.symbol.substring(0, 2).toUpperCase()}
                        </span>
                      </div>

                      {/* Token Info */}
                      <div className="flex flex-col items-start">
                        <span className="text-base font-medium text-foreground">
                          {token.name}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {token.symbol}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Balance and USD Value */}
                      <div className="flex flex-col items-end">
                        <span className="text-base font-medium text-foreground">
                          {token.balanceFormatted}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          ${token.balanceUsd}
                        </span>
                      </div>

                      {/* Check Icon if selected */}
                      {isSelected && (
                        <div className="w-5 h-5">
                          <CheckIcon />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>

      {/* Network Selection Modal */}
      <NetworkSelectionModal
        open={showNetworkModal}
        onOpenChange={setShowNetworkModal}
        selectedNetwork={selectedNetwork}
        onSelectNetwork={setSelectedNetwork}
      />
    </Dialog>
  );
};
