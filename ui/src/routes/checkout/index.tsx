import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useGetCheckoutSession } from '@/integrations/api/checkout';
import { usePreparePayment } from '@/integrations/api/payments';
import { useQuery } from '@tanstack/react-query';
import { sessionQueryOptions } from '@/lib/session';
import { authClient } from '@/lib/auth-client';
import { useEffect, useState, useRef } from 'react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/loading';
import { toast } from 'sonner';
import { queryClient } from '@/utils/orpc';
import { PaymentMethodSelection } from '@/components/checkout/payment-method-selection';
import { WalletConnectStep } from '@/components/checkout/wallet-connect-step';
import { PaymentAssetSelection } from '@/components/checkout/payment-asset-selection';
import { formatAssetAmount } from '@/utils/format';

export const Route = createFileRoute('/checkout/')({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      sessionId: (search.sessionId as string) || undefined,
    };
  },
  component: CheckoutRoute,
});

function CheckoutRoute() {
  const { sessionId } = Route.useSearch();
  const navigate = useNavigate();
  const { data: authSession } = useQuery(sessionQueryOptions);
  const accountId = authClient.near.getAccountId() || authSession?.user?.id || null;
  const isConnected = !!accountId;
  const { data: sessionData, isLoading: sessionLoading, error: sessionError } = useGetCheckoutSession(sessionId);
  const preparePayment = usePreparePayment();
  const [paymentData, setPaymentData] = useState<Awaited<ReturnType<typeof preparePayment.mutateAsync>> | null>(null);

  // Auth flow state
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [isSigningInWithNear, setIsSigningInWithNear] = useState(false);

  // Payment method selection (wallet, card, or deposit)
  const [paymentMethod, setPaymentMethod] = useState<'wallet' | 'card' | 'deposit' | null>(null);

  // Payment asset selection (user chooses what to pay with)
  const [selectedPaymentAsset, setSelectedPaymentAsset] = useState<{ amount: string; asset: { chain: string; symbol: string } } | null>(null);

  // Pre-connection asset selection (before wallet is connected)
  const [preConnectionAssetId, setPreConnectionAssetId] = useState<string>('nep141:wrap.near');

  // Auto-select pre-connection asset when wallet connects
  useEffect(() => {
    if (isConnected && paymentMethod === 'wallet' && !selectedPaymentAsset) {
      setSelectedPaymentAsset({ 
        amount: '0',
        asset: { chain: 'NEAR', symbol: 'USDC' }
      });
    }
  }, [isConnected, paymentMethod, selectedPaymentAsset, preConnectionAssetId]);

  // Track which payment attempts we've made to prevent infinite loops
  // Key: `${sessionId}_${accountId}_${chain}_${symbol}`
  const attemptedPayments = useRef<Set<string>>(new Set());

  // Auth handlers
  const handleWalletConnect = async () => {
    setIsConnectingWallet(true);
    try {
      await authClient.requestSignIn.near(
        { recipient: process.env.PUBLIC_ACCOUNT_ID || "every.near" },
        {
          onSuccess: () => {
            setIsConnectingWallet(false);
            toast.success("Wallet connected");
          },
          onError: (error: any) => {
            setIsConnectingWallet(false);
            console.error("Wallet connection failed:", error);
            const errorMessage =
              error.code === "SIGNER_NOT_AVAILABLE"
                ? "NEAR wallet not available"
                : error.message || "Failed to connect wallet";
            toast.error(errorMessage);
          },
        }
      );
    } catch (error) {
      setIsConnectingWallet(false);
      console.error("Wallet connection error:", error);
      toast.error("Failed to connect to NEAR wallet");
    }
  };

  const handleNearSignIn = async () => {
    setIsSigningInWithNear(true);
    try {
      await authClient.signIn.near(
        { recipient: process.env.PUBLIC_ACCOUNT_ID || "every.near" },
        {
          onSuccess: () => {
            setIsSigningInWithNear(false);
            queryClient.invalidateQueries({ queryKey: ['session'] });
            const freshAccountId = authClient.near.getAccountId();
            toast.success(`Signed in as: ${freshAccountId || accountId}`);
          },
          onError: (error: any) => {
            setIsSigningInWithNear(false);
            console.error("NEAR sign in error:", error);

            if ((error as any)?.code === "NONCE_NOT_FOUND") {
              toast.error("Session expired. Please reconnect your wallet.");
              return;
            }

            toast.error(
              error instanceof Error ? error.message : "Authentication failed"
            );
          },
        }
      );
    } catch (error) {
      setIsSigningInWithNear(false);
      console.error("NEAR sign in error:", error);

      if ((error as any)?.code === "NONCE_NOT_FOUND") {
        toast.error("Session expired. Please reconnect your wallet.");
        return;
      }

      toast.error("Authentication failed");
    }
  };

  const handleLogout = async () => {
    try {
      await authClient.near.disconnect();
      await authClient.signOut();
      queryClient.invalidateQueries({ queryKey: ['session'] });
      setPaymentMethod(null);
      setSelectedPaymentAsset(null);
      setPaymentData(null);
      toast.success("Logged out successfully");
    } catch (error) {
      console.error("Logout error:", error);
      toast.error("Failed to logout");
    }
  };

  // Auto-prepare payment when wallet is connected and asset is selected
  const sessionIdForPayment = sessionData?.session?.sessionId;

  useEffect(() => {
    if (
      isConnected &&
      accountId &&
      sessionIdForPayment &&
      selectedPaymentAsset &&
      !paymentData &&
      !preparePayment.isPending
    ) {
      const attemptKey = `${sessionIdForPayment}_${accountId}_${selectedPaymentAsset.asset.chain}_${selectedPaymentAsset.asset.symbol}`;
      if (attemptedPayments.current.has(attemptKey)) {
        return;
      }

      attemptedPayments.current.add(attemptKey);
      const session = sessionData.session;
      const idempotencyKey = `checkout_${session.sessionId}_${accountId}_${selectedPaymentAsset.asset.chain}_${selectedPaymentAsset.asset.symbol}_${Date.now()}`;
      console.log('[checkout] preparing payment', {
        sessionId: session.sessionId,
        payer: accountId,
        payerAsset: selectedPaymentAsset,
        destination: session.amount,
        recipient: session.recipient,
      });

      preparePayment.mutate(
        {
          input: {
            sessionId: session.sessionId,
            payerAsset: selectedPaymentAsset,
            payer: {
              address: accountId,
            },
            idempotencyKey,
          },
        },
        {
          onSuccess: (data) => {
            setPaymentData(data);
          },
          onError: (error) => {
            console.error('Failed to prepare payment:', error);
          },
        }
      );
    }
  }, [isConnected, accountId, sessionIdForPayment, selectedPaymentAsset?.asset?.chain, selectedPaymentAsset?.asset?.symbol, paymentData, preparePayment.isPending]);

  if (sessionLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  if (sessionError || !sessionData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card>
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>
              {sessionError instanceof Error ? sessionError.message : 'Failed to load checkout session'}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const session = sessionData.session;

  console.log('[CheckoutRoute] Session data:', session);

  const handlePaymentSuccess = () => {
    if (!paymentData?.depositAddress) {
      toast.error('Deposit address not available');
      return;
    }

    // Format payment details for the processing page
    const paymentAmount = paymentData.quote?.amountInFormatted || `${session.amount.amount} USDC`;
    const asset = selectedPaymentAsset?.asset.symbol || 'USDC';
    const network = 'NEAR Protocol';

    // Calculate pricing rate correctly
    // amountIn is what user pays, amountOut is what merchant receives
    const pricingRate = paymentData.quote && paymentData.quote.amountInFormatted && paymentData.quote.amountOutFormatted
      ? `1 USD ≈ ${(parseFloat(paymentData.quote.amountInFormatted) / parseFloat(paymentData.quote.amountOutFormatted)).toFixed(4)} ${asset}`
      : '1 USD ≈ 0 NEAR';

    // Format fee amounts properly using formatAssetAmount
    const feeAmount = paymentData.payment.feeQuote?.totalFee?.amount || '0';
    const feeAssetId = paymentData.payment.feeQuote?.totalFee?.assetId || 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';

    // Use formatAssetAmount to handle any asset type correctly
    const formattedFee = feeAmount !== '0'
      ? formatAssetAmount(feeAmount, feeAssetId)
      : '0.00';

    const networkFee = `$${formattedFee}`;
    const pingpayFee = '$0.00';
    const totalFee = `$${formattedFee}`;

    navigate({
      to: '/checkout/processing',
      search: {
        depositAddress: paymentData.depositAddress,
        sessionId,
        paymentAmount,
        asset,
        network,
        pricingRate,
        networkFee,
        pingpayFee,
        totalFee,
      },
    });
  };

  const handleAssetChange = (chain: string, symbol: string) => {
    setSelectedPaymentAsset({ amount: '0', asset: { chain, symbol } });
    setPaymentData(null);
    // Clear attempted payments when switching assets to allow re-preparation
    attemptedPayments.current.clear();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--widget-fill)' }}>
      {/* DEV: Logout Button */}
      {isConnected && (
        <div className="fixed top-4 right-4 z-50">
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-sm font-mono border border-border bg-destructive/10 hover:bg-destructive/20 text-destructive rounded-lg transition-all"
          >
            logout ({accountId})
          </button>
        </div>
      )}

      <div className="w-full max-w-[500px]">
        {/* Step 1: Payment Method Selection */}
        {!paymentMethod && (
          <PaymentMethodSelection
            amount={session.amount.amount}
            assetId={session.amount.assetId}
            onSelectMethod={setPaymentMethod}
          />
        )}

        {/* Step 2: Wallet Connect */}
        {paymentMethod === 'wallet' && !isConnected && (
          <WalletConnectStep
            amount={session.amount.amount}
            assetId={session.amount.assetId}
            accountId={accountId}
            isConnectingWallet={isConnectingWallet}
            isSigningInWithNear={isSigningInWithNear}
            selectedPaymentAssetId={preConnectionAssetId}
            onConnect={handleWalletConnect}
            onSignIn={handleNearSignIn}
            onBack={() => setPaymentMethod(null)}
            onAssetChange={setPreConnectionAssetId}
          />
        )}

        {/* Step 3: Payment Asset Selection */}
        {paymentMethod === 'wallet' && isConnected && (
          <PaymentAssetSelection
            amount={session.amount.amount}
            assetId={session.amount.assetId}
            selectedPaymentAsset={selectedPaymentAsset}
            paymentData={paymentData}
            accountId={accountId}
            onBack={() => {
              setPaymentMethod(null);
              setSelectedPaymentAsset(null);
              setPaymentData(null);
            }}
            onAssetChange={handleAssetChange}
            onPaymentSuccess={handlePaymentSuccess}
          />
        )}

        {session.cancelUrl && (
          <div className="text-center">
            <a
              href={session.cancelUrl}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </a>
          </div>
        )}
      </div>
    </div>
  );
}