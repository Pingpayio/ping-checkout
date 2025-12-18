import { useEffect, useState } from 'react';
import { useGetPayment } from '@/integrations/api/payments';

export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export interface PaymentStatusResult {
  status: PaymentStatus;
  error?: string;
  isLoading: boolean;
}

export function usePaymentStatus(
  paymentId: string | undefined,
  enabled = true
): PaymentStatusResult {
  const { data, error, isLoading } = useGetPayment(paymentId, enabled);
  const [status, setStatus] = useState<PaymentStatus>('PENDING');

  useEffect(() => {
    if (data?.payment) {
      setStatus(data.payment.status as PaymentStatus);
    }
  }, [data]);

  return {
    status,
    error: error instanceof Error ? error.message : undefined,
    isLoading,
  };
}

