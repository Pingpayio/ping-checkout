import { useState } from 'react';
import { Button } from '../ui/button';
import { useWallet } from '@/lib/wallet';
import type { PreparePaymentOutput } from '@/integrations/api/payments';
import { toast } from 'sonner';

interface PaymentButtonProps {
  paymentData: PreparePaymentOutput;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export function PaymentButton({ paymentData, onSuccess, onError }: PaymentButtonProps) {
  const { near, accountId, isConnected } = useWallet();
  const [isProcessing, setIsProcessing] = useState(false);

  const handlePayment = async () => {
    if (!near || !accountId || !isConnected) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (!paymentData.depositAddress) {
      toast.error('Deposit address not available');
      return;
    }

    setIsProcessing(true);

    try {
      // Transfer tokens to deposit address
      const amount = paymentData.payment.request.asset.amount;
      const assetId = paymentData.payment.request.asset.assetId;

      // Parse asset ID to get contract address
      // Format: nep141:usdc.near or usdc.near
      const contractId = assetId.replace(/^nep141:/, '');

      // For native NEAR (wrap.near), use transfer
      // For fungible tokens, use ft_transfer
      if (contractId === 'wrap.near') {
        // Transfer NEAR - amount is already in yoctoNEAR
        const result = await near
          .transaction(accountId)
          .transfer(paymentData.depositAddress, `${amount} yocto`)
          .send();

        toast.success('Payment sent successfully!');
        onSuccess?.();
      } else {
        // Transfer fungible token (NEP-141)
        const result = await near
          .transaction(accountId)
          .functionCall(
            contractId,
            'ft_transfer',
            {
              receiver_id: paymentData.depositAddress,
              amount: amount,
            },
            {
              attachedDeposit: '1 yocto', // Required for ft_transfer
            }
          )
          .send();

        toast.success('Payment sent successfully!');
        onSuccess?.();
      }
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
      disabled={!isConnected || isProcessing || !paymentData.depositAddress}
      className="w-full"
      size="lg"
    >
      {!isConnected
        ? 'Connect Wallet to Pay'
        : isProcessing
        ? 'Processing...'
        : 'Pay Now'}
    </Button>
  );
}

