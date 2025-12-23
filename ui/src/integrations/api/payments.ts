import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/utils/orpc';

export type PreparePaymentInput = {
  input: {
    sessionId: string;
    payerAsset: {
      amount: string;
      asset: {
        chain: string;
        symbol: string;
      };
    };
    payer: {
      address: string;
    };
    idempotencyKey: string;
  };
};

export type PreparePaymentOutput = Awaited<ReturnType<typeof apiClient.payments.prepare>>;
export type GetPaymentInput = { paymentId: string };
export type GetPaymentOutput = Awaited<ReturnType<typeof apiClient.payments.get>>;
export type GetPaymentStatusInput = { depositAddress: string };
export type GetPaymentStatusOutput = Awaited<ReturnType<typeof apiClient.payments.getStatus>>;
export type SubmitPaymentInput = Awaited<Parameters<typeof apiClient.payments.submit>[0]>;
export type SubmitPaymentOutput = Awaited<ReturnType<typeof apiClient.payments.submit>>;

export function usePreparePayment() {
  return useMutation({
    mutationFn: async (input: PreparePaymentInput): Promise<PreparePaymentOutput> => {
      return await apiClient.payments.prepare(input);
    },
  });
}

export function useGetPayment(paymentId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['payments', paymentId],
    queryFn: async (): Promise<GetPaymentOutput> => {
      if (!paymentId) throw new Error('Payment ID is required');
      return await apiClient.payments.get({ paymentId });
    },
    enabled: enabled && !!paymentId,
    refetchInterval: (query) => {
      // Poll every 5 seconds if payment is still pending
      const data = query.state.data;
      if (data?.payment?.status === 'PENDING') {
        return 5000;
      }
      return false;
    },
  });
}

export function useGetPaymentStatus(depositAddress: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['payments', 'status', depositAddress],
    queryFn: async (): Promise<GetPaymentStatusOutput> => {
      if (!depositAddress) throw new Error('Deposit address is required');
      return await apiClient.payments.getStatus({ depositAddress });
    },
    enabled: enabled && !!depositAddress,
    refetchInterval: (query) => {
      // Poll every 5 seconds if payment is still pending or processing
      const data = query.state.data;
      if (data?.status === 'PENDING' || data?.status === 'PROCESSING') {
        return 5000;
      }
      return false;
    },
  });
}

export function useSubmitPayment() {
  return useMutation({
    mutationFn: async (input: SubmitPaymentInput): Promise<SubmitPaymentOutput> => {
      return await apiClient.payments.submit(input);
    },
  });
}

