import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import type { PreparePaymentOutput } from '@/integrations/api/payments';
import type { GetCheckoutSessionOutput } from '@/integrations/api/checkout';

interface PaymentSummaryProps {
  session: GetCheckoutSessionOutput['session'];
  paymentData?: PreparePaymentOutput;
}

export function PaymentSummary({ session, paymentData }: PaymentSummaryProps) {
  const formatAmount = (amount: string, assetId: string) => {
    // TODO: handle decimals properly
    const assetSymbol = assetId.replace(/^nep141:/, '').split('.')[0].toUpperCase();
    return `${amount} ${assetSymbol}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Summary</CardTitle>
        <CardDescription>Review your payment details</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Amount:</span>
          <span className="font-medium">
            {formatAmount(session.amount.amount, session.amount.assetId)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Recipient:</span>
          <span className="font-mono text-sm">{session.recipient.address}</span>
        </div>
        {paymentData?.quote && (
          <>
            <div className="border-t pt-4 mt-4">
              <div className="flex justify-between mb-2">
                <span className="text-muted-foreground">Deposit Address:</span>
                <span className="font-mono text-xs break-all text-right">
                  {paymentData.quote.depositAddress}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount In:</span>
                <span className="font-medium">{paymentData.quote.amountInFormatted}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount Out:</span>
                <span className="font-medium">{paymentData.quote.amountOutFormatted}</span>
              </div>
            </div>
          </>
        )}
        {paymentData?.payment.feeQuote && (
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Fee:</span>
            <span>
              {formatAmount(
                paymentData.payment.feeQuote.totalFee.amount,
                paymentData.payment.feeQuote.totalFee.assetId
              )}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

