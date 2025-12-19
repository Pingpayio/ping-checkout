import { useGetPaymentStatus } from '@/integrations/api/payments';

export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'PROCESSING' | 'REFUNDED';

export interface PaymentStatusResult {
  status: PaymentStatus;
  error?: string;
  isLoading: boolean;
}

export function usePaymentStatus(
  depositAddress: string | undefined,
  enabled = true
): PaymentStatusResult {
  const { data, error, isLoading } = useGetPaymentStatus(depositAddress, enabled);

  // Map API status to our status type
  const status: PaymentStatus = data?.status === 'PROCESSING' 
    ? 'PROCESSING'
    : data?.status === 'REFUNDED'
    ? 'REFUNDED'
    : data?.status === 'SUCCESS'
    ? 'SUCCESS'
    : data?.status === 'FAILED'
    ? 'FAILED'
    : 'PENDING';

  return {
    status,
    error: error instanceof Error ? error.message : undefined,
    isLoading,
  };
}

