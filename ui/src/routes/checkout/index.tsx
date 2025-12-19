import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useGetCheckoutSession } from '@/integrations/api/checkout';
import { usePreparePayment } from '@/integrations/api/payments';
import { useQuery } from '@tanstack/react-query';
import { sessionQueryOptions } from '@/lib/session';
import { authClient } from '@/lib/auth-client';
import { PaymentButton } from '@/components/checkout/payment-button';
import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/loading';
import { toast } from 'sonner';
import { queryClient } from '@/utils/orpc';
import { formatAssetAmount, getAssetSymbol } from '@/utils/format';

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
  
  // Payment asset selection (user chooses what to pay with)
  const [selectedPaymentAsset, setSelectedPaymentAsset] = useState<{ assetId: string; amount: string } | null>(null);
  
  // Track which payment attempts we've made to prevent infinite loops
  // Key: `${sessionId}_${accountId}_${assetId}`
  const attemptedPayments = useRef<Set<string>>(new Set());

  // Auth handlers (same as login page)
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
            // Get fresh accountId after sign-in
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
      const attemptKey = `${sessionIdForPayment}_${accountId}_${selectedPaymentAsset.assetId}`;
      if (attemptedPayments.current.has(attemptKey)) {
        return; // Already attempted this combination
      }
      
      attemptedPayments.current.add(attemptKey);
      const session = sessionData.session;
      const idempotencyKey = `checkout_${session.sessionId}_${accountId}_${selectedPaymentAsset.assetId}_${Date.now()}`;
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
              chainId: 'near:mainnet', // For now, only NEAR
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
            // Don't remove from set - prevents infinite retry loop
            // User can refresh page if they want to retry
          },
        }
      );
    }
    // Only depend on stable primitive values
  }, [isConnected, accountId, sessionIdForPayment, selectedPaymentAsset?.assetId, paymentData, preparePayment.isPending]);

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

  const handlePaymentSuccess = () => {
    // Navigate to processing page
    navigate({
      to: '/checkout/processing',
      search: { paymentId: paymentData?.payment.paymentId, sessionId },
    });
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Checkout</h1>
          <p className="text-muted-foreground mt-2">Complete your payment</p>
        </div>

        {!isConnected ? (
          <Card>
            <CardHeader>
              <CardTitle>Sign in</CardTitle>
              <CardDescription>Sign in with your NEAR wallet to continue</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!accountId ? (
                <button
                  onClick={handleWalletConnect}
                  disabled={isConnectingWallet || isSigningInWithNear}
                  className="w-full px-6 py-4 text-sm font-mono border border-border hover:border-primary/50 bg-muted/20 hover:bg-muted/40 transition-all rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isConnectingWallet ? "connecting..." : "connect near wallet"}
                </button>
              ) : (
                <button
                  onClick={handleNearSignIn}
                  disabled={isConnectingWallet || isSigningInWithNear}
                  className="w-full px-6 py-4 text-sm font-mono border border-border hover:border-primary/50 bg-muted/20 hover:bg-muted/40 transition-all rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSigningInWithNear ? "signing in..." : `sign in as ${accountId}`}
                </button>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            {!selectedPaymentAsset && (
              <Card>
                <CardHeader>
                  <CardTitle>Select Payment Method</CardTitle>
                  <CardDescription>Choose what you want to pay with</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm text-muted-foreground mb-2">
                    Paying on: <span className="font-mono">NEAR Mainnet</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setSelectedPaymentAsset({ assetId: 'nep141:wrap.near', amount: '0' })}
                      className="px-4 py-3 text-sm font-mono border border-border hover:border-primary/50 bg-muted/20 hover:bg-muted/40 transition-all rounded-lg text-left"
                    >
                      <div className="font-semibold">NEAR</div>
                      <div className="text-xs text-muted-foreground">wrap.near</div>
                    </button>
                    <button
                      onClick={() => setSelectedPaymentAsset({ assetId: 'nep141:usdc.near', amount: '0' })}
                      className="px-4 py-3 text-sm font-mono border border-border hover:border-primary/50 bg-muted/20 hover:bg-muted/40 transition-all rounded-lg text-left"
                    >
                      <div className="font-semibold">USDC</div>
                      <div className="text-xs text-muted-foreground">usdc.near</div>
                    </button>
                  </div>
                </CardContent>
              </Card>
            )}

            {selectedPaymentAsset && paymentData && (
              <Card>
                <CardHeader>
                  <CardTitle>Payment Quote</CardTitle>
                  <CardDescription>Review the payment details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-sm text-muted-foreground">You will spend:</span>
                      <span className="font-semibold text-lg">
                        {paymentData.quote?.amountInFormatted || 
                         `${formatAssetAmount(paymentData.payment.request.asset.amount, selectedPaymentAsset.assetId)} ${getAssetSymbol(selectedPaymentAsset.assetId)}`}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-sm text-muted-foreground">Merchant receives:</span>
                      <span className="font-semibold text-lg">
                        {paymentData.quote?.amountOutFormatted || 
                         `${formatAssetAmount(session.amount.amount, session.amount.assetId)} ${getAssetSymbol(session.amount.assetId)}`}
                      </span>
                    </div>
                    {paymentData.depositAddress && (
                      <div className="pt-2">
                        <div className="text-xs text-muted-foreground mb-1">Deposit Address:</div>
                        <div className="font-mono text-xs break-all bg-muted/50 p-2 rounded">
                          {paymentData.depositAddress}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {selectedPaymentAsset && !paymentData && (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground text-center">
                    Selected: <span className="font-mono text-foreground">
                      {getAssetSymbol(selectedPaymentAsset.assetId)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            {preparePayment.isPending && (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center text-muted-foreground">Preparing payment...</div>
                </CardContent>
              </Card>
            )}

            {preparePayment.isError && !paymentData && (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-destructive mb-2">Failed to prepare payment</p>
                    <p className="text-sm text-muted-foreground">
                      {preparePayment.error instanceof Error 
                        ? preparePayment.error.message 
                        : 'Please try again or refresh the page'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {paymentData && (
              <Card>
                <CardHeader>
                  <CardTitle>Complete Payment</CardTitle>
                  <CardDescription>Send payment to the deposit address</CardDescription>
                </CardHeader>
                <CardContent>
                  <PaymentButton paymentData={paymentData} onSuccess={handlePaymentSuccess} />
                </CardContent>
              </Card>
            )}
          </>
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

