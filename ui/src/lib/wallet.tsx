import { NearConnector } from '@hot-labs/near-connect';
import { Near, fromHotConnect } from 'near-kit';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface WalletContextValue {
  connector: NearConnector | null;
  near: Near | null;
  accountId: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within WalletProvider');
  }
  return context;
}

interface WalletProviderProps {
  children: ReactNode;
  network?: 'mainnet' | 'testnet';
}

export function WalletProvider({ children, network = 'mainnet' }: WalletProviderProps) {
  const [connector, setConnector] = useState<NearConnector | null>(null);
  const [near, setNear] = useState<Near | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    const connectorInstance = new NearConnector({ network });
    setConnector(connectorInstance);

    const handleSignIn = async (data: unknown) => {
      try {
        const nearInstance = new Near({
          network,
          wallet: fromHotConnect(connectorInstance),
        });
        setNear(nearInstance);

        // Be defensive about the event payload shape
        const maybeAccountId =
          typeof data === 'object' && data !== null && 'accountId' in data
            ? (data as any).accountId
            : undefined;

        setAccountId(typeof maybeAccountId === 'string' ? maybeAccountId : null);
        setIsConnecting(false);
      } catch (error) {
        console.error('Failed to initialize Near instance:', error);
        setIsConnecting(false);
      }
    };

    const handleSignOut = () => {
      setNear(null);
      setAccountId(null);
    };

    // Listen for sign in/out
    connectorInstance.on('wallet:signIn', handleSignIn as any);
    connectorInstance.on('wallet:signOut', handleSignOut as any);

    return () => {
      // Some event emitters require the handler arg for `off`
      try {
        (connectorInstance as any).off?.('wallet:signIn', handleSignIn);
        (connectorInstance as any).off?.('wallet:signOut', handleSignOut);
      } catch {
        // ignore
      }
    };
  }, [network]);

  const connect = async () => {
    if (!connector) return;
    setIsConnecting(true);
    try {
      await connector.connect();
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      setIsConnecting(false);
    }
  };

  const disconnect = async () => {
    if (!connector) return;
    try {
      await connector.disconnect();
      setNear(null);
      setAccountId(null);
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
    }
  };

  return (
    <WalletContext.Provider
      value={{
        connector,
        near,
        accountId,
        isConnected: !!accountId && !!near,
        isConnecting,
        connect,
        disconnect,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}


