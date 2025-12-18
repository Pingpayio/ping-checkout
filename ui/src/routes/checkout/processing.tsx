import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { usePaymentStatus } from '@/hooks/use-payment-status';
import { useGetCheckoutSession } from '@/integrations/api/checkout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/loading';
import { useEffect } from 'react';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export const Route = createFileRoute('/checkout/processing')({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      paymentId: (search.paymentId as string) || undefined,
      sessionId: (search.sessionId as string) || undefined,
    };
  },
  component: ProcessingRoute,
});

function ProcessingRoute() {
  const { paymentId, sessionId } = Route.useSearch();
  const navigate = useNavigate();
  const { status, isLoading } = usePaymentStatus(paymentId, !!paymentId);
  const { data: sessionData } = useGetCheckoutSession(sessionId, !!sessionId);

  useEffect(() => {
    if (status === 'SUCCESS' && sessionData?.session.successUrl) {
      // Redirect to success URL after a short delay
      setTimeout(() => {
        window.location.href = sessionData.session.successUrl!;
      }, 2000);
    } else if (status === 'FAILED' && sessionData?.session.cancelUrl) {
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

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Payment Status</CardTitle>
          <CardDescription>Your payment is being processed</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === 'PENDING' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-lg font-medium">Processing payment...</p>
              <p className="text-sm text-muted-foreground">
                This may take a few moments. Please wait.
              </p>
            </div>
          )}

          {status === 'SUCCESS' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <p className="text-lg font-medium text-green-500">Payment Successful!</p>
              <p className="text-sm text-muted-foreground">
                Redirecting you back...
              </p>
            </div>
          )}

          {status === 'FAILED' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <XCircle className="h-12 w-12 text-red-500" />
              <p className="text-lg font-medium text-red-500">Payment Failed</p>
              <p className="text-sm text-muted-foreground">
                Redirecting you back...
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

