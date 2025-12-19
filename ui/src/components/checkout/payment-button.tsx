import { useState } from 'react';
import { Button } from '../ui/button';
import { authClient } from '@/lib/auth-client';
import type { PreparePaymentOutput } from '@/integrations/api/payments';
import { toast } from 'sonner';

interface PaymentButtonProps {
  paymentData: PreparePaymentOutput;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export function PaymentButton({ paymentData, onSuccess, onError }: PaymentButtonProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const accountId = authClient.near.getAccountId();

  const handlePayment = async () => {
    if (!accountId) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (!paymentData.depositAddress) {
      toast.error('Deposit address not available');
      return;
    }

    // Get amountIn from quote (what user needs to send)
    // Since quote type is EXACT_OUTPUT, amountIn is the input amount we should transfer
    const amountIn = paymentData.quote?.amountIn;
    if (!amountIn) {
      toast.error('Quote amount not available');
      return;
    }

    setIsProcessing(true);

    try {
      // Get near-kit client from authClient
      const nearClient = authClient.near.getNearClient();
      if (!nearClient) {
        throw new Error('NEAR wallet not connected');
      }

      // Transfer native NEAR to deposit address
      // amountIn is in yoctoNEAR (string from quote)
      // near-kit accepts human-readable strings like "1.5 NEAR" or yocto format
      // Convert yoctoNEAR to NEAR format for near-kit
      const amountInBigInt = BigInt(amountIn);
      const oneNEAR = BigInt(10 ** 24);
      const wholeNEAR = amountInBigInt / oneNEAR;
      const fractional = amountInBigInt % oneNEAR;
      
      // Format as "X.XXXXXX NEAR" (near-kit format)
      let amountInNEAR: string;
      if (fractional === BigInt(0)) {
        amountInNEAR = `${wholeNEAR.toString()} NEAR`;
      } else {
        const fractionalStr = fractional.toString().padStart(24, '0');
        const trimmed = fractionalStr.replace(/0+$/, '');
        amountInNEAR = `${wholeNEAR.toString()}.${trimmed} NEAR`;
      }

      await nearClient
        .transaction(accountId)
        .transfer(paymentData.depositAddress, amountInNEAR as any)
        .send({ waitUntil: 'FINAL' });

      toast.success('Payment sent successfully!');
      onSuccess?.();
    } catch (error) {
      console.error('Payment error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Payment failed';
      toast.error(`Payment failed: ${errorMessage}`);
      onError?.(error instanceof Error ? error : new Error(errorMessage));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Button
      onClick={handlePayment}
      disabled={!accountId || isProcessing || !paymentData.depositAddress}
      className="w-full"
      size="lg"
    >
      {isProcessing
        ? 'Processing...'
        : 'Pay Now'}
    </Button>
  );
}

