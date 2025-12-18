import { Effect } from 'every-plugin/effect';
import { eq, and } from 'drizzle-orm';
import type { Database } from '../db';
import { payments } from '../db/schema';
import type {
  PaymentRequest,
  PreparePaymentResponse,
  SubmitPaymentInput,
  SubmitPaymentResponse,
  GetPaymentInput,
  GetPaymentResponse,
  Payment,
} from '../schema';
import { randomBytes } from 'crypto';

export class PaymentNotFoundError extends Error {
  readonly _tag = 'PaymentNotFoundError';
  constructor(public paymentId: string) {
    super(`Payment not found: ${paymentId}`);
  }
}

export class PaymentAlreadyFinalizedError extends Error {
  readonly _tag = 'PaymentAlreadyFinalizedError';
  constructor(public paymentId: string, public status: string) {
    super(`Payment ${paymentId} is already finalized with status: ${status}`);
  }
}

export class ProviderAuthError extends Error {
  readonly _tag = 'ProviderAuthError';
  constructor(message: string = 'Authentication failed with payment provider') {
    super(message);
  }
}

export class ProviderRateLimitError extends Error {
  readonly _tag = 'ProviderRateLimitError';
  constructor(message: string = 'Rate limit exceeded. Please try again later') {
    super(message);
  }
}

export class ProviderValidationError extends Error {
  readonly _tag = 'ProviderValidationError';
  constructor(message: string) {
    super(message);
  }
}

export class ProviderError extends Error {
  readonly _tag = 'ProviderError';
  constructor(message: string = 'Payment provider error') {
    super(message);
  }
}

interface ExecutionResponse {
  depositAddress?: string;
  intentId?: string;
  quoteId?: string;
  executionId?: string;
  txHash?: string;
  txId?: string;
  status?: string;
  [key: string]: unknown;
}

interface StatusResponse {
  status: 'SUCCESS' | 'REFUNDED' | 'PENDING' | string;
  txId?: string;
  txHash?: string;
  transactionId?: string;
  reason?: string;
  message?: string;
  error?: string;
}

export class PaymentsService {
  private readonly ONECLICK_BASE_URL = 'https://1click.chaindefuser.com';
  
  constructor(
    private db: Database,
    private apiKey?: string
  ) {}

  private executeOneClick(payload: unknown): Effect.Effect<ExecutionResponse, Error> {
    return Effect.gen(this, function* (_) {
      const possibleEndpoints = ['v0/execute', 'v0/intents', 'v0/create', 'execute'];
      let lastError: Error | null = null;
      
      for (const endpoint of possibleEndpoints) {
        const url = `${this.ONECLICK_BASE_URL}/${endpoint}`.replace(/([^:]\/)\/+/g, '$1');
        
        try {
          const result = yield* _(
            Effect.tryPromise({
              try: async () => {
                const headers: Record<string, string> = {
                  'Content-Type': 'application/json',
                };
                
                if (this.apiKey) {
                  headers['Authorization'] = `Bearer ${this.apiKey}`;
                }
                
                const response = await fetch(url, {
                  method: 'POST',
                  headers,
                  body: JSON.stringify(payload),
                });
                
                if (response.status === 404) {
                  throw new Error('NOT_FOUND');
                }
                
                const data = await response.json().catch(() => ({})) as { message?: string; [key: string]: unknown };
                
                if (response.status === 401 || response.status === 403) {
                  throw new ProviderAuthError(data.message || 'Authentication failed');
                }
                
                if (response.status === 429) {
                  throw new ProviderRateLimitError(data.message || 'Rate limit exceeded');
                }
                
                if (response.status >= 500) {
                  throw new ProviderError(data.message || 'Provider service error');
                }
                
                if (response.status >= 400) {
                  const message = data.message || 'Validation error';
                  if (message.includes('tokenOut is not valid')) {
                    throw new ProviderValidationError('Payout token not supported');
                  } else if (message.includes('amount must be a number string') || message.includes('Amount is too low')) {
                    throw new ProviderValidationError('Amount must be greater than 0');
                  } else if (message.includes('recipient/refundTo should not be empty')) {
                    throw new ProviderValidationError('Recipient address required');
                  } else if (message.includes('slippageTolerance') || message.includes('deadline must be ISO 8601')) {
                    throw new ProviderValidationError('Invalid request parameters');
                  } else {
                    throw new ProviderValidationError(message);
                  }
                }
                
                if (!response.ok) {
                  const text = await response.text().catch(() => '');
                  throw new Error(`One-Click /${endpoint} failed (${response.status}): ${text}`);
                }
                
                return data as ExecutionResponse;
              },
              catch: (error) => {
                if (error instanceof Error) {
                  return error;
                }
                return new Error(`Failed to execute payment: ${String(error)}`);
              },
            })
          );
          
          return result;
        } catch (error) {
          if (error instanceof Error && error.message === 'NOT_FOUND') {
            continue;
          }
          
          if (error instanceof ProviderAuthError || 
              error instanceof ProviderRateLimitError || 
              error instanceof ProviderValidationError || 
              error instanceof ProviderError) {
            return yield* _(Effect.fail(error));
          }
          
          lastError = error instanceof Error ? error : new Error(String(error));
        }
      }
      
      return yield* _(Effect.fail(lastError || new Error('No valid execute endpoint found. Tried: ' + possibleEndpoints.join(', '))));
    });
  }

  getIntentsStatus(depositAddress: string): Effect.Effect<StatusResponse, Error> {
    return Effect.gen(this, function* (_) {
      const url = `${this.ONECLICK_BASE_URL}/v0/status`;
      
      const result = yield* _(
        Effect.tryPromise({
          try: async () => {
            const headers: Record<string, string> = {};
            
            if (this.apiKey) {
              headers['Authorization'] = `Bearer ${this.apiKey}`;
            }
            
            const queryUrl = new URL(url);
            queryUrl.searchParams.set('depositAddress', depositAddress);
            
            const response = await fetch(queryUrl.toString(), {
              method: 'GET',
              headers,
            });
            
            if (response.status === 404) {
              return { status: 'PENDING' } as StatusResponse;
            }
            
            if (!response.ok) {
              console.error(`Status check failed: ${response.status}`);
              return { status: 'PENDING' } as StatusResponse;
            }
            
            const data = await response.json() as StatusResponse;
            
            if (data.status === 'completed' || data.status === 'success') {
              return {
                status: 'SUCCESS',
                txId: data.txId || data.transactionId || data.txHash
              } as StatusResponse;
            } else if (data.status === 'failed' || data.status === 'error' || data.status === 'REFUNDED') {
              return {
                status: 'REFUNDED',
                reason: data.reason || data.message || data.error || 'Transaction failed'
              } as StatusResponse;
            } else {
              return { status: 'PENDING' } as StatusResponse;
            }
          },
          catch: (error) => new Error(`Failed to check status: ${error instanceof Error ? error.message : String(error)}`),
        })
      );
      
      return result;
    });
  }

  preparePayment(
    merchantId: string,
    request: PaymentRequest
  ): Effect.Effect<PreparePaymentResponse, Error> {
    return Effect.gen(this, function* (_) {
      const existing = yield* _(
        Effect.tryPromise({
          try: () =>
            this.db
              .select()
              .from(payments)
              .where(
                and(
                  eq(payments.merchantId, merchantId),
                  eq(payments.idempotencyKey, request.idempotencyKey)
                )
              )
              .limit(1),
          catch: (error) => new Error(`Failed to check existing payment: ${error}`),
        })
      );

      if (existing.length > 0) {
        const existingPayment = existing[0]!;
        const payment: Payment = {
          paymentId: existingPayment.id,
          status: existingPayment.status as Payment['status'],
          request: {
            payer: {
              address: existingPayment.payerAddress,
              chainId: existingPayment.payerChainId,
            },
            recipient: {
              address: existingPayment.recipientAddress,
              chainId: existingPayment.recipientChainId,
            },
            asset: {
              assetId: existingPayment.assetId,
              amount: existingPayment.amountValue,
            },
            memo: existingPayment.memo ?? undefined,
            idempotencyKey: existingPayment.idempotencyKey,
          },
          createdAt: existingPayment.createdAt,
          updatedAt: existingPayment.updatedAt,
        };

        if (existingPayment.quoteTotalFee && existingPayment.quoteAssetId) {
          payment.feeQuote = {
            totalFee: {
              assetId: existingPayment.quoteAssetId,
              amount: existingPayment.quoteTotalFee,
            },
          };
        }

        return { payment };
      }

      const paymentId = `pay_${randomBytes(16).toString('hex')}`;
      const now = new Date().toISOString();

      yield* _(
        Effect.tryPromise({
          try: () =>
            this.db.insert(payments).values({
              id: paymentId,
              merchantId,
              status: 'PENDING',
              payerAddress: request.payer.address,
              payerChainId: request.payer.chainId,
              recipientAddress: request.recipient.address,
              recipientChainId: request.recipient.chainId,
              assetId: request.asset.assetId,
              amountValue: request.asset.amount,
              memo: request.memo ?? null,
              idempotencyKey: request.idempotencyKey,
              quoteTotalFee: null,
              quoteAssetId: null,
              settlementRefs: null,
              metadata: null,
              createdAt: now,
              updatedAt: now,
            }),
          catch: (error) => new Error(`Failed to create payment: ${error}`),
        })
      );

      const payment: Payment = {
        paymentId,
        status: 'PENDING',
        request,
        createdAt: now,
        updatedAt: now,
      };

      return { payment };
    });
  }

  getPayment(
    merchantId: string,
    input: GetPaymentInput
  ): Effect.Effect<GetPaymentResponse, PaymentNotFoundError | Error> {
    return Effect.gen(this, function* (_) {
      const rows = yield* _(
        Effect.tryPromise({
          try: () =>
            this.db
              .select()
              .from(payments)
              .where(
                and(
                  eq(payments.id, input.paymentId),
                  eq(payments.merchantId, merchantId)
                )
              )
              .limit(1),
          catch: (error) => new Error(`Failed to fetch payment: ${error}`),
        })
      );

      if (rows.length === 0) {
        return yield* _(Effect.fail(new PaymentNotFoundError(input.paymentId)));
      }

      const row = rows[0]!;

      const payment: Payment = {
        paymentId: row.id,
        status: row.status as Payment['status'],
        request: {
          payer: {
            address: row.payerAddress,
            chainId: row.payerChainId,
          },
          recipient: {
            address: row.recipientAddress,
            chainId: row.recipientChainId,
          },
          asset: {
            assetId: row.assetId,
            amount: row.amountValue,
          },
          memo: row.memo ?? undefined,
          idempotencyKey: row.idempotencyKey,
        },
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };

      if (row.quoteTotalFee && row.quoteAssetId) {
        payment.feeQuote = {
          totalFee: {
            assetId: row.quoteAssetId,
            amount: row.quoteTotalFee,
          },
        };
      }

      return { payment };
    });
  }

  submitPayment(
    merchantId: string,
    input: SubmitPaymentInput
  ): Effect.Effect<SubmitPaymentResponse, PaymentNotFoundError | PaymentAlreadyFinalizedError | Error> {
    return Effect.gen(this, function* (_) {
      const rows = yield* _(
        Effect.tryPromise({
          try: () =>
            this.db
              .select()
              .from(payments)
              .where(
                and(
                  eq(payments.id, input.paymentId),
                  eq(payments.merchantId, merchantId)
                )
              )
              .limit(1),
          catch: (error) => new Error(`Failed to fetch payment: ${error}`),
        })
      );

      if (rows.length === 0) {
        return yield* _(Effect.fail(new PaymentNotFoundError(input.paymentId)));
      }

      const row = rows[0]!;

      if (row.status === 'SUCCESS' || row.status === 'FAILED') {
        return yield* _(
          Effect.fail(new PaymentAlreadyFinalizedError(input.paymentId, row.status))
        );
      }

      let settlementRefs: Record<string, string> = {};
      let finalStatus: Payment['status'] = 'SUCCESS';

      if (this.apiKey && input.signedPayload) {
        const executionResult = yield* _(this.executeOneClick(input.signedPayload));
        
        if (executionResult.depositAddress) {
          settlementRefs.depositAddress = executionResult.depositAddress;
        }
        if (executionResult.intentId) {
          settlementRefs.intentId = executionResult.intentId;
        }
        if (executionResult.quoteId) {
          settlementRefs.quoteId = executionResult.quoteId;
        }
        if (executionResult.executionId) {
          settlementRefs.executionId = executionResult.executionId;
        }
        if (executionResult.txHash || executionResult.txId) {
          settlementRefs.txHash = executionResult.txHash || executionResult.txId || '';
        }
        
        if (executionResult.status === 'pending' || executionResult.status === 'PENDING') {
          finalStatus = 'PENDING';
        }
      }

      const now = new Date().toISOString();
      const settlementRefsJson = Object.keys(settlementRefs).length > 0 
        ? JSON.stringify(settlementRefs) 
        : null;

      yield* _(
        Effect.tryPromise({
          try: () =>
            this.db
              .update(payments)
              .set({
                status: finalStatus,
                settlementRefs: settlementRefsJson,
                updatedAt: now,
              })
              .where(eq(payments.id, input.paymentId)),
          catch: (error) => new Error(`Failed to update payment: ${error}`),
        })
      );

      const payment: Payment = {
        paymentId: row.id,
        status: finalStatus,
        request: {
          payer: {
            address: row.payerAddress,
            chainId: row.payerChainId,
          },
          recipient: {
            address: row.recipientAddress,
            chainId: row.recipientChainId,
          },
          asset: {
            assetId: row.assetId,
            amount: row.amountValue,
          },
          memo: row.memo ?? undefined,
          idempotencyKey: row.idempotencyKey,
        },
        createdAt: row.createdAt,
        updatedAt: now,
      };

      if (row.quoteTotalFee && row.quoteAssetId) {
        payment.feeQuote = {
          totalFee: {
            assetId: row.quoteAssetId,
            amount: row.quoteTotalFee,
          },
        };
      }

      return { payment };
    });
  }
}
