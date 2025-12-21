import { createFileRoute } from '@tanstack/react-router';
import { usePaymentStatus } from '@/hooks/use-payment-status';
import { useGetCheckoutSession } from '@/integrations/api/checkout';
import { Card, CardContent } from '@/components/ui/card';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { PaymentStatusCard } from '@/components/checkout/payment-status-card';
import { PaymentSuccessCard } from '@/components/checkout/payment-success-card';
import { PaymentFailedCard } from '@/components/checkout/payment-failed-card';

export const Route = createFileRoute('/checkout/processing')({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      depositAddress: (search.depositAddress as string) || undefined,
      sessionId: (search.sessionId as string) || undefined,
      paymentAmount: (search.paymentAmount as string) || undefined,
      asset: (search.asset as string) || undefined,
      network: (search.network as string) || undefined,
      pricingRate: (search.pricingRate as string) || undefined,
      networkFee: (search.networkFee as string) || undefined,
      pingpayFee: (search.pingpayFee as string) || undefined,
      totalFee: (search.totalFee as string) || undefined,
    };
  },
  component: ProcessingRoute,
});

function ProcessingRoute() {
  const {
    depositAddress,
    sessionId,
    paymentAmount,
    asset,
    network,
    pricingRate,
    networkFee,
    pingpayFee,
    totalFee
  } = Route.useSearch();
  const { status, isLoading } = usePaymentStatus(depositAddress, !!depositAddress);
  const { data: sessionData } = useGetCheckoutSession(sessionId, !!sessionId);

  useEffect(() => {
    if (status === 'SUCCESS' && sessionData?.session.successUrl) {
      // Redirect to success URL after a short delay
      setTimeout(() => {
        window.location.href = sessionData.session.successUrl!;
      }, 2000);
    } else if ((status === 'FAILED' || status === 'REFUNDED') && sessionData?.session.cancelUrl) {
      // Redirect to cancel URL after a short delay
      setTimeout(() => {
        window.location.href = sessionData.session.cancelUrl!;
      }, 2000);
    }
  }, [status, sessionData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Processing payment...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show success state
  if (status === 'SUCCESS') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background p-4">
        <PaymentSuccessCard
          paymentAmount={paymentAmount || '0 USDC'}
          asset={asset || 'USDC'}
          network={network || 'NEAR Protocol'}
          recipientAddress={depositAddress || ''}
          pricingRate={pricingRate || '1 USD ≈ 0 NEAR'}
          networkFee={networkFee || '$0.00'}
          pingpayFee={pingpayFee || '$0.00'}
          totalFee={totalFee || '$0.00'}
          onViewExplorer={depositAddress ? () => {
            window.open(`https://explorer.near-intents.org/transactions/${depositAddress}`, '_blank');
          } : undefined}
        />
      </div>
    );
  }

  // Show failed state
  if (status === 'FAILED' || status === 'REFUNDED') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background p-4">
        <PaymentFailedCard
          paymentAmount={paymentAmount || '0 USDC'}
          asset={asset || 'USDC'}
          network={network || 'NEAR Protocol'}
          recipientAddress={depositAddress || ''}
          pricingRate={pricingRate}
          networkFee={networkFee}
          pingpayFee={pingpayFee}
          totalFee={totalFee}
          errorMessage={status === 'REFUNDED'
            ? 'Your payment was refunded. You will receive your funds back.'
            : undefined
          }
        />
      </div>
    );
  }

  // Show processing state with PaymentStatusCard
  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <PaymentStatusCard
        paymentAmount={paymentAmount || '0 USDC'}
        asset={asset || 'USDC'}
        network={network || 'NEAR Protocol'}
        recipientAddress={depositAddress || ''}
        pricingRate={pricingRate || '1 USD ≈ 0 NEAR'}
        networkFee={networkFee || '$0.00'}
        pingpayFee={pingpayFee || '$0.00'}
        totalFee={totalFee || '$0.00'}
      />
    </div>
  );
}

