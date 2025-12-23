import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { CloseIcon } from './icons';
import PingIcon from '@/assets/logos/PING_ICON.png';

interface NetworkSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedNetwork: string;
  onSelectNetwork: (network: string) => void;
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

// Network configurations
const networks = [
  {
    id: 'NEAR',
    name: 'NEAR',
    icon: (
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#00C08B] to-[#00A872] flex items-center justify-center">
        <span className="text-white text-sm font-bold">N</span>
      </div>
    ),
  },
  // Future networks can be added here
];

export const NetworkSelectionModal = ({
  open,
  onOpenChange,
  selectedNetwork,
  onSelectNetwork,
}: NetworkSelectionModalProps) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredNetworks = networks.filter((network) =>
    network.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleNetworkSelect = (networkId: string) => {
    onSelectNetwork(networkId);
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
              Select Network
            </DialogTitle>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Search Bar */}
        <div className="px-6 pt-4 pb-6">
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2">
              <SearchIcon />
            </div>
            <Input
              placeholder="Search name"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-12 bg-background"
            />
          </div>
        </div>

        {/* Network List */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {filteredNetworks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <p className="text-sm text-muted-foreground">No networks found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredNetworks.map((network) => {
                const isSelected = network.id === selectedNetwork;

                return (
                  <button
                    key={network.id}
                    onClick={() => handleNetworkSelect(network.id)}
                    className={`w-full flex items-center justify-between p-4 rounded-lg border transition-all ${
                      isSelected
                        ? 'bg-primary/10 border-primary/50'
                        : 'bg-muted/10 border-border hover:bg-muted/30 hover:border-muted-foreground/30'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {network.icon}
                      <span className="text-base font-medium text-foreground">
                        {network.name}
                      </span>
                    </div>

                    {isSelected && (
                      <div className="w-5 h-5">
                        <CheckIcon />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
