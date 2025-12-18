export type TransactionDirection = "INCOMING" | "OUTGOING";

export type TransactionStatus =
  | "PENDING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type TransactionSummary = {
  id: string;
  merchantId: string;
  direction: TransactionDirection;
  amount: string;
  currency: string;
  network: string;
  sender?: string | null;
  recipient?: string | null;
  fees?: string | null;
  status: TransactionStatus;
  occurredAt: string;
};

export type TransactionListFilters = {
  from?: Date;
  to?: Date;
  direction?: TransactionDirection;
  currency?: string;
  network?: string;
  limit?: number;
  cursor?: string;
};

export type TransactionListResult = {
  items: TransactionSummary[];
  nextCursor?: string;
};

/**
 * Placeholder implementation. Real implementation provided elsewhere.
 */
export async function listTransactions(
  _merchantId: string,
  _filters: TransactionListFilters,
): Promise<TransactionListResult> {
  return { items: [] };
}


