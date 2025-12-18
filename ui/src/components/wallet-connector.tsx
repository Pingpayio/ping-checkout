import { useWallet } from '@/lib/wallet';
import { Button } from './ui/button';

export function WalletConnector() {
  const { accountId, isConnected, isConnecting, connect, disconnect } = useWallet();

  if (isConnected && accountId) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm font-mono text-muted-foreground">{accountId}</span>
        <Button variant="outline" size="sm" onClick={disconnect}>
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <Button onClick={connect} disabled={isConnecting}>
      {isConnecting ? 'Connecting...' : 'Connect Wallet'}
    </Button>
  );
}

