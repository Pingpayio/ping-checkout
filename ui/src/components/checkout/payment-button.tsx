import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import type { PreparePaymentOutput } from '@/integrations/api/payments';
import { toast } from 'sonner';

interface PaymentButtonProps {
  paymentData: PreparePaymentOutput;
  selectedPaymentAsset: { assetId: string; amount: string };
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export function PaymentButton({ paymentData, selectedPaymentAsset, onSuccess, onError }: PaymentButtonProps) {
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

      // Determine if this is a native NEAR transfer or NEP-141 token transfer
      const isNativeNear = selectedPaymentAsset.assetId === 'nep141:wrap.near' ||
                           selectedPaymentAsset.assetId.toLowerCase().includes('wrap.near');

      if (isNativeNear) {
        // Native NEAR transfer
        // amountIn is in yoctoNEAR (string from quote)
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
      } else {
        // NEP-141 token transfer (USDC, etc.)
        // Extract contract address from assetId (format: "nep141:CONTRACT_ADDRESS")
        const contractAddress = selectedPaymentAsset.assetId.replace(/^nep141:/, '');

        // amountIn is already in the token's base units (e.g., 6 decimals for USDC)
        // Use ft_transfer_call to send tokens to the deposit address
        const msg = ''; // Empty message, the backend will handle this

        await nearClient
          .transaction(accountId)
          .functionCall(
            contractAddress,
            'ft_transfer_call',
            {
              receiver_id: paymentData.depositAddress,
              amount: amountIn,
              msg: msg,
            },
            {
              gas: '100000000000000', // 100 TGas
              attachedDeposit: 1n, // 1 yoctoNEAR required for ft_transfer_call
            }
          )
          .send({ waitUntil: 'FINAL' });
      }

      console.log('[PaymentButton] Payment transaction completed successfully');
      console.log('[PaymentButton] Deposit address:', paymentData.depositAddress);
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
    <button
      onClick={handlePayment}
      disabled={!accountId || isProcessing || !paymentData.depositAddress}
      className="flex items-center justify-center transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        width: '450px',
        height: '58px',
        borderRadius: '8px',
        paddingTop: '8px',
        paddingRight: '16px',
        paddingBottom: '8px',
        paddingLeft: '16px',
        gap: '8px',
        backgroundColor: 'var(--brand-purple)',
        color: 'var(--font-purple-button)',
        opacity: 1
      }}
    >
      <span className="text-base font-normal">
        {isProcessing ? 'Processing...' : 'PAY'}
      </span>
    </button>
  );
}

