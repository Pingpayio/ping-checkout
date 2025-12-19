import { Effect } from 'every-plugin/effect';
import { eq, and } from 'drizzle-orm';
import type { Database } from '../db';
import { payments } from '../db/schema';
import type {
  PaymentRequest,
  PreparePaymentInput,
  PreparePaymentResponse,
  SubmitPaymentInput,
  SubmitPaymentResponse,
  GetPaymentInput,
  GetPaymentResponse,
  Payment,
  CheckoutSession,
} from '../schema';
import { CheckoutService, CheckoutSessionNotFoundError } from './checkout';
import { randomBytes } from 'crypto';

// In-memory payment store (temporary, until DB is properly configured)
// Key: idempotencyKey, Value: { payment, depositAddress, quote }
const inMemoryPayments = new Map<string, {
  payment: Payment;
  depositAddress?: string;
  quote?: PreparePaymentResponse['quote'];
}>();

const PAYMENTS_INSTANCE_ID = randomBytes(4).toString('hex');
console.log(`[payments] in-memory store enabled (instance=${PAYMENTS_INSTANCE_ID})`);

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

interface QuoteRequestParams {
  dry?: boolean;
  swapType: "EXACT_INPUT" | "EXACT_OUTPUT";
  slippageTolerance: number; // basis points, e.g., 100 for 1%
  originAsset: string; // assetId
  depositType: "ORIGIN_CHAIN" | "INTENTS";
  destinationAsset: string; // assetId
  amount: string; // smallest unit
  refundTo: string; // address
  refundType: "ORIGIN_CHAIN" | "INTENTS";
  recipient: string; // address
  recipientType: "DESTINATION_CHAIN" | "INTENTS";
  deadline: string; // ISO date-time
  referral?: string;
  quoteWaitingTimeMs?: number;
  appFees?: Array<{ recipient: string; fee: number }>;
}

interface QuoteResponseData {
  timestamp: string;
  signature: string;
  quoteRequest: QuoteRequestParams;
  quote: {
    depositAddress: string;
    amountIn: string;
    amountInFormatted: string;
    amountInUsd?: string;
    minAmountIn?: string;
    amountOut: string;
    amountOutFormatted: string;
    amountOutUsd?: string;
    minAmountOut?: string;
    deadline: string;
    timeWhenInactive: string;
    timeEstimate: number;
  };
}

interface IntentsStatusResponse {
  correlationId?: string;
  quoteResponse?: unknown;
  status: 'KNOWN_DEPOSIT' | 'TXPENDING_DEPOSIT' | 'INCOMPLETE_DEPOSIT' | 'PROCESSING' | 'SUCCESS' | 'REFUNDED' | 'FAILED';
  updatedAt?: string;
  swapDetails?: unknown;
}

interface StatusResponse {
  status: 'SUCCESS' | 'REFUNDED' | 'FAILED' | 'PENDING' | 'PROCESSING';
  txId?: string;
  reason?: string;
  updatedAt?: string;
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

  private getIntentsQuoteForCheckout(
    sourceAsset: { assetId: string; amount: string },
    destinationAsset: { assetId: string; amount: string },
    payer: { address: string; chainId: string },
    recipient: { address: string; chainId: string }
  ): Effect.Effect<QuoteResponseData, Error> {
    return Effect.gen(this, function* (_) {
      if (!this.apiKey) {
        return yield* _(Effect.fail(new Error('NEAR_INTENTS_API_KEY not configured')));
      }

      // Normalize asset IDs
      const originAsset = sourceAsset.assetId.startsWith('nep141:') 
        ? sourceAsset.assetId 
        : `nep141:${sourceAsset.assetId}`;
      const destAsset = destinationAsset.assetId.startsWith('nep141:') 
        ? destinationAsset.assetId 
        : `nep141:${destinationAsset.assetId}`;
      
      // Calculate deadline (5 minutes from now)
      const deadline = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      
      const quoteParams: QuoteRequestParams = {
        dry: false, // Dry run for quote
        swapType: "EXACT_OUTPUT", // We want exact output (merchant's requested amount)
        slippageTolerance: 100, // 1%
        originAsset,
        depositType: "ORIGIN_CHAIN",
        destinationAsset: destAsset,
        amount: destinationAsset.amount, // Amount merchant wants to receive
        refundTo: payer.address,
        refundType: "ORIGIN_CHAIN",
        recipient: recipient.address,
        recipientType: "DESTINATION_CHAIN",
        deadline,
        referral: 'ping-checkout',
      };

      const url = `${this.ONECLICK_BASE_URL}/v0/quote`;
      
      const result = yield* _(
        Effect.tryPromise({
          try: async () => {
            const headers: Record<string, string> = {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.apiKey}`,
            };
            
            const response = await fetch(url, {
              method: 'POST',
              headers,
              body: JSON.stringify(quoteParams),
            });
            
            if (!response.ok) {
              const data = await response.json().catch(() => ({})) as { message?: string; [key: string]: unknown };
              
              if (response.status === 401 || response.status === 403) {
                throw new ProviderAuthError(data.message || 'Authentication failed');
              }
              
              if (response.status === 429) {
                throw new ProviderRateLimitError(data.message || 'Rate limit exceeded');
              }
              
              if (response.status >= 400) {
                const message = data.message || 'Validation error';
                throw new ProviderValidationError(message);
              }
              
              throw new ProviderError(data.message || 'Failed to get quote');
            }
            
            return await response.json() as QuoteResponseData;
          },
          catch: (error) => {
            if (error instanceof ProviderAuthError || 
                error instanceof ProviderRateLimitError || 
                error instanceof ProviderValidationError || 
                error instanceof ProviderError) {
              return error;
            }
            return new Error(`Failed to get quote: ${error instanceof Error ? error.message : String(error)}`);
          },
        })
      );
      
      return result;
    });
  }

  private getIntentsQuote(request: PaymentRequest): Effect.Effect<QuoteResponseData, Error> {
    // Legacy method - kept for backwards compatibility
    // For checkout flow, use getIntentsQuoteForCheckout instead
    return this.getIntentsQuoteForCheckout(
      request.asset, // Source asset
      request.asset, // Destination asset (same for legacy)
      request.payer,
      request.recipient
    );
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
            
            const data = await response.json() as IntentsStatusResponse;
            
            // Map intents API status to our status
            if (data.status === 'SUCCESS') {
              return {
                status: 'SUCCESS' as const,
                updatedAt: data.updatedAt,
              } as StatusResponse;
            } else if (data.status === 'REFUNDED' || data.status === 'FAILED') {
              return {
                status: data.status as 'REFUNDED' | 'FAILED',
                updatedAt: data.updatedAt,
              } as StatusResponse;
            } else if (data.status === 'PROCESSING' || data.status === 'INCOMPLETE_DEPOSIT' || data.status === 'TXPENDING_DEPOSIT') {
              return {
                status: 'PROCESSING' as const,
                updatedAt: data.updatedAt,
              } as StatusResponse;
            } else {
              // KNOWN_DEPOSIT or other pending states
              return {
                status: 'PENDING' as const,
                updatedAt: data.updatedAt,
              } as StatusResponse;
            }
          },
          catch: (error) => new Error(`Failed to check status: ${error instanceof Error ? error.message : String(error)}`),
        })
      );
      
      return result;
    });
  }

  preparePaymentFromSession(
    merchantId: string,
    input: PreparePaymentInput,
    checkoutService: CheckoutService
  ): Effect.Effect<PreparePaymentResponse, CheckoutSessionNotFoundError | Error> {
    return Effect.gen(this, function* (_) {
      // Fetch session to get merchant's destination requirements
      const sessionResult = yield* _(
        checkoutService.getSession(merchantId, { sessionId: input.sessionId })
      );
      const session = sessionResult.session;

      // Build payment request:
      // - Source: User-selected payment asset (payerAsset)
      // - Destination: Session's recipient and amount (merchant requirements)
      const paymentRequest: PaymentRequest = {
        payer: input.payer,
        recipient: session.recipient, // From session (merchant's destination)
        asset: input.payerAsset, // User-selected payment asset (source)
        idempotencyKey: input.idempotencyKey,
      };

      // Now prepare payment with the built request
      // But we need to generate quote with source asset -> destination asset
      return yield* _(this.preparePaymentWithQuote(
        merchantId,
        paymentRequest,
        input.payerAsset, // Source asset (user selection)
        session.amount, // Destination amount from session
        session.recipient // Destination recipient from session
      ));
    });
  }

  private preparePaymentWithQuote(
    merchantId: string,
    request: PaymentRequest,
    sourceAsset: { assetId: string; amount: string },
    destinationAmount: { assetId: string; amount: string },
    destinationRecipient: { address: string; chainId: string }
  ): Effect.Effect<PreparePaymentResponse, Error> {
    return Effect.gen(this, function* (_) {
      // Check in-memory store first (idempotency)
      const existing = inMemoryPayments.get(request.idempotencyKey);
      if (existing) {
        console.log(
          `[payments] found existing payment (instance=${PAYMENTS_INSTANCE_ID}, idempotencyKey=${request.idempotencyKey})`
        );
        return {
          payment: existing.payment,
          depositAddress: existing.depositAddress,
          quote: existing.quote,
        };
      }

      const paymentId = `pay_${randomBytes(16).toString('hex')}`;
      const now = new Date().toISOString();

      // Get quote from intents API: source asset -> destination asset
      let quoteData: QuoteResponseData | null = null;
      let depositAddress: string | null = null;
      let quoteTotalFee: string | null = null;
      let quoteAssetId: string | null = null;
      let settlementRefs: Record<string, string> = {};

      if (this.apiKey) {
        try {
          // Generate quote: user's payment asset -> merchant's destination asset
          quoteData = yield* _(this.getIntentsQuoteForCheckout(
            sourceAsset, // Source: what user wants to pay with
            destinationAmount, // Destination: what merchant wants to receive
            request.payer,
            destinationRecipient
          ));
          depositAddress = quoteData.quote.depositAddress;
          
          // Calculate fee if applicable
          if (quoteData.quote.amountIn && quoteData.quote.amountOut) {
            const amountIn = BigInt(quoteData.quote.amountIn);
            const amountOut = BigInt(quoteData.quote.amountOut);
            if (amountIn > amountOut) {
              quoteTotalFee = (amountIn - amountOut).toString();
              quoteAssetId = sourceAsset.assetId;
            }
          }
          
          // Store quote reference
          settlementRefs.quoteId = quoteData.signature;
          settlementRefs.depositAddress = depositAddress;
        } catch (error) {
          // Log error but don't fail payment creation
          console.error('Failed to get quote from intents API:', error);
        }
      }

      const settlementRefsJson = Object.keys(settlementRefs).length > 0 
        ? JSON.stringify(settlementRefs) 
        : null;

      // Store in-memory instead of DB (temporary)
      // Skip DB insert for now

      const payment: Payment = {
        paymentId,
        status: 'PENDING',
        request,
        createdAt: now,
        updatedAt: now,
      };

      if (quoteTotalFee && quoteAssetId) {
        payment.feeQuote = {
          totalFee: {
            assetId: quoteAssetId,
            amount: quoteTotalFee,
          },
        };
      }

      const response: PreparePaymentResponse = { 
        payment,
        depositAddress: depositAddress || undefined,
        quote: quoteData ? {
          depositAddress: quoteData.quote.depositAddress,
          amountIn: quoteData.quote.amountIn,
          amountInFormatted: quoteData.quote.amountInFormatted,
          amountOut: quoteData.quote.amountOut,
          amountOutFormatted: quoteData.quote.amountOutFormatted,
          deadline: quoteData.quote.deadline,
          quoteRequest: {
            originAsset: quoteData.quoteRequest.originAsset,
            destinationAsset: quoteData.quoteRequest.destinationAsset,
          },
        } : undefined,
      };

      // Store in memory for idempotency
      inMemoryPayments.set(request.idempotencyKey, {
        payment,
        depositAddress: response.depositAddress,
        quote: response.quote,
      });

      return response;
    });
  }

  preparePayment(
    merchantId: string,
    request: PaymentRequest
  ): Effect.Effect<PreparePaymentResponse, Error> {
    return Effect.gen(this, function* (_) {
      console.log(
        `[payments] preparePayment called (instance=${PAYMENTS_INSTANCE_ID}, merchantId=${merchantId}, idempotencyKey=${request.idempotencyKey})`
      );

      if (existing.length > 0) {
        const existingPayment = existing[0]!;
        const payment: Payment = {
          paymentId: existingPayment.id,
          status: existingPayment.status as Payment['status'],
          request: {
            payer: {
              address: existingPayment.payerAddress,
            },
            recipient: {
              address: existingPayment.recipientAddress,
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

        // Extract deposit address from settlement refs if available
        let depositAddress: string | undefined;
        if (existingPayment.settlementRefs) {
          try {
            const refs = JSON.parse(existingPayment.settlementRefs) as Record<string, string>;
            depositAddress = refs.depositAddress;
          } catch {
            // Ignore parse errors
          }
        }

        return { 
          payment,
          depositAddress,
        };
      }

      const paymentId = `pay_${randomBytes(16).toString('hex')}`;
      const now = new Date().toISOString();

      // Get quote from intents API if API key is configured
      let quoteData: QuoteResponseData | null = null;
      let depositAddress: string | null = null;
      let quoteTotalFee: string | null = null;
      let quoteAssetId: string | null = null;
      let settlementRefs: Record<string, string> = {};

      //to get Intents quote, we need to use the session data to get:
      // 1. the asset id (which would be the destination asset)
      // 2. the amount (which would be the amount to send)
      // 3. the recipient (which would be the recipient address)
      // 4. Origin asset id come from payment request based on the user's selection
      //if (this.apiKey) {
        try {
          quoteData = yield* _(this.getIntentsQuote(request));
          depositAddress = quoteData.quote.depositAddress;
          
          // Calculate fee if applicable
          if (quoteData.quote.amountIn && quoteData.quote.amountOut) {
            const amountIn = BigInt(quoteData.quote.amountIn);
            const amountOut = BigInt(quoteData.quote.amountOut);
            if (amountIn > amountOut) {
              quoteTotalFee = (amountIn - amountOut).toString();
              quoteAssetId = request.asset.assetId;
            }
          }
          
          // Store quote reference
          settlementRefs.quoteId = quoteData.signature;
          settlementRefs.depositAddress = depositAddress;
        } catch (error) {
          // Log error but don't fail payment creation
          console.error('Failed to get quote from intents API:', error);
        }
      //}

      const settlementRefsJson = Object.keys(settlementRefs).length > 0 
        ? JSON.stringify(settlementRefs) 
        : null;

      yield* _(
        Effect.tryPromise({
          try: () =>
            this.db.insert(payments).values({
              id: paymentId,
              merchantId,
              status: 'PENDING',
              payerAddress: request.payer.address,
              recipientAddress: request.recipient.address,
              assetId: request.asset.assetId,
              amountValue: request.asset.amount,
              memo: request.memo ?? null,
              idempotencyKey: request.idempotencyKey,
              quoteTotalFee,
              quoteAssetId,
              settlementRefs: settlementRefsJson,
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

      if (quoteTotalFee && quoteAssetId) {
        payment.feeQuote = {
          totalFee: {
            assetId: quoteAssetId,
            amount: quoteTotalFee,
          },
        };
      }

      // Add deposit address and quote to response via metadata
      // We'll update the schema to include these fields properly
      const response: PreparePaymentResponse = { 
        payment,
        depositAddress: depositAddress || undefined,
        quote: quoteData ? {
          depositAddress: quoteData.quote.depositAddress,
          amountIn: quoteData.quote.amountIn,
          amountInFormatted: quoteData.quote.amountInFormatted,
          amountOut: quoteData.quote.amountOut,
          amountOutFormatted: quoteData.quote.amountOutFormatted,
          deadline: quoteData.quote.deadline,
          quoteRequest: {
            originAsset: quoteData.quoteRequest.originAsset,
            destinationAsset: quoteData.quoteRequest.destinationAsset,
          },
        } : undefined,
      };

      // Store in memory for idempotency
      inMemoryPayments.set(request.idempotencyKey, {
        payment,
        depositAddress: response.depositAddress,
        quote: response.quote,
      });

      return response;
    });
  }

  getPayment(
    merchantId: string,
    input: GetPaymentInput
  ): Effect.Effect<GetPaymentResponse, PaymentNotFoundError | Error> {
    return Effect.gen(this, function* (_) {
      console.log(
        `[payments] getPayment called (instance=${PAYMENTS_INSTANCE_ID}, merchantId=${merchantId}, paymentId=${input.paymentId})`
      );

      // Check in-memory store (search by paymentId)
      for (const [idempotencyKey, stored] of inMemoryPayments.entries()) {
        if (stored.payment.paymentId === input.paymentId) {
          console.log(
            `[payments] found payment in memory (instance=${PAYMENTS_INSTANCE_ID}, paymentId=${input.paymentId}, count=${inMemoryPayments.size})`
          );
          return { payment: stored.payment };
        }
      }
      
      console.log(
        `[payments] payment not found in memory (instance=${PAYMENTS_INSTANCE_ID}, paymentId=${input.paymentId}, count=${inMemoryPayments.size})`
      );

      // Fallback to DB if not found in memory (for backwards compatibility)
      const rows = yield* _(
        Effect.tryPromise({
          try: () =>
            this.db
              .select()
              .from(payments)
              .where(eq(payments.id, input.paymentId))
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
          },
          recipient: {
            address: row.recipientAddress,
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

  getPaymentStatus(
    depositAddress: string
  ): Effect.Effect<StatusResponse, Error> {
    return this.getIntentsStatus(depositAddress);
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
          },
          recipient: {
            address: row.recipientAddress,
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
