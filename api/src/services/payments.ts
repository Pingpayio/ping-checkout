import { Effect } from 'every-plugin/effect';
import { eq, and } from 'drizzle-orm';
import type { Database } from '@/db';
import { payments } from '@/db/schema';
import type {
  PaymentRequest,
  PreparePaymentResponse,
  SubmitPaymentInput,
  SubmitPaymentResponse,
  GetPaymentInput,
  GetPaymentResponse,
  Payment,
} from '@/schema';
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

export class PaymentsService {
  constructor(private db: Database) {}

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

      const now = new Date().toISOString();

      yield* _(
        Effect.tryPromise({
          try: () =>
            this.db
              .update(payments)
              .set({
                status: 'SUCCESS',
                updatedAt: now,
              })
              .where(eq(payments.id, input.paymentId)),
          catch: (error) => new Error(`Failed to update payment: ${error}`),
        })
      );

      const payment: Payment = {
        paymentId: row.id,
        status: 'SUCCESS',
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
