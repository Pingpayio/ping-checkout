import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useGetCheckoutSession } from '@/integrations/api/checkout';
import { usePreparePayment } from '@/integrations/api/payments';
import { useWallet } from '@/lib/wallet';
import { WalletConnector } from '@/components/wallet-connector';
import { PaymentSummary } from '@/components/checkout/payment-summary';
import { PaymentButton } from '@/components/checkout/payment-button';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/loading';

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
  const { accountId, isConnected } = useWallet();
  const { data: sessionData, isLoading: sessionLoading, error: sessionError } = useGetCheckoutSession(sessionId);
  const preparePayment = usePreparePayment();
  const [paymentData, setPaymentData] = useState<Awaited<ReturnType<typeof preparePayment.mutateAsync>> | null>(null);

  // Auto-prepare payment when wallet is connected
  useEffect(() => {
    if (isConnected && accountId && sessionData?.session && !paymentData && !preparePayment.isPending) {
      const idempotencyKey = `checkout_${sessionData.session.sessionId}_${accountId}_${Date.now()}`;
      
      preparePayment.mutate(
        {
          request: {
            payer: {
              address: accountId,
              chainId: sessionData.session.recipient.chainId,
            },
            recipient: sessionData.session.recipient,
            asset: sessionData.session.amount,
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
  }, [isConnected, accountId, sessionData, paymentData, preparePayment]);

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
              <CardTitle>Connect Wallet</CardTitle>
              <CardDescription>Please connect your NEAR wallet to continue</CardDescription>
            </CardHeader>
            <CardContent>
              <WalletConnector />
            </CardContent>
          </Card>
        ) : (
          <>
            <PaymentSummary session={session} paymentData={paymentData || undefined} />

            {preparePayment.isPending && (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center text-muted-foreground">Preparing payment...</div>
                </CardContent>
              </Card>
            )}

            {paymentData && (
              <Card>
                <CardHeader>
                  <CardTitle>Complete Payment</CardTitle>
                  <CardDescription>Review and confirm your payment</CardDescription>
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

