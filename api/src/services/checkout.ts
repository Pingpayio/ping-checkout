import { Effect } from 'every-plugin/effect';
import { eq } from 'drizzle-orm';
import type { Database } from '@/db';
import { checkoutSessions } from '@/db/schema';
import type {
  CreateCheckoutSessionInput,
  CreateCheckoutSessionResponse,
  GetCheckoutSessionInput,
  GetCheckoutSessionResponse,
  CheckoutSession,
} from '@/schema';
import { randomBytes } from 'crypto';

export class CheckoutSessionNotFoundError extends Error {
  readonly _tag = 'CheckoutSessionNotFoundError';
  constructor(public sessionId: string) {
    super(`Checkout session not found: ${sessionId}`);
  }
}

export class CheckoutService {
  constructor(private db: Database) {}

  createSession(
    merchantId: string,
    input: CreateCheckoutSessionInput
  ): Effect.Effect<CreateCheckoutSessionResponse, Error> {
    return Effect.gen(this, function* (_) {
      const sessionId = `cs_${randomBytes(16).toString('hex')}`;
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      const themeJson = input.theme ? JSON.stringify(input.theme) : null;
      const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

      yield* _(
        Effect.tryPromise({
          try: () =>
            this.db.insert(checkoutSessions).values({
              id: sessionId,
              merchantId,
              amountAssetId: input.amount.assetId,
              amountValue: input.amount.amount,
              recipientAddress: input.recipient.address,
              recipientChainId: input.recipient.chainId,
              themeJson,
              successUrl: input.successUrl,
              cancelUrl: input.cancelUrl,
              status: 'CREATED',
              createdAt: now,
              expiresAt,
              metadataJson,
            }),
          catch: (error) => new Error(`Failed to create session: ${error}`),
        })
      );

      const session: CheckoutSession = {
        sessionId,
        status: 'CREATED',
        paymentId: null,
        amount: input.amount,
        recipient: input.recipient,
        theme: input.theme,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        createdAt: now,
        expiresAt,
        metadata: input.metadata,
      };

      const sessionUrl = `https://pay.pingpay.io/checkout/${sessionId}`;

      return { session, sessionUrl };
    });
  }

  getSession(
    merchantId: string,
    input: GetCheckoutSessionInput
  ): Effect.Effect<GetCheckoutSessionResponse, CheckoutSessionNotFoundError | Error> {
    return Effect.gen(this, function* (_) {
      const rows = yield* _(
        Effect.tryPromise({
          try: () =>
            this.db
              .select()
              .from(checkoutSessions)
              .where(eq(checkoutSessions.id, input.sessionId))
              .limit(1),
          catch: (error) => new Error(`Failed to fetch session: ${error}`),
        })
      );

      if (rows.length === 0) {
        return yield* _(Effect.fail(new CheckoutSessionNotFoundError(input.sessionId)));
      }

      const row = rows[0]!;

      const theme = row.themeJson ? JSON.parse(row.themeJson) : undefined;
      const metadata = row.metadataJson ? JSON.parse(row.metadataJson) : undefined;

      const session: CheckoutSession = {
        sessionId: row.id,
        status: row.status as CheckoutSession['status'],
        paymentId: row.paymentId ?? null,
        amount: {
          assetId: row.amountAssetId,
          amount: row.amountValue,
        },
        recipient: {
          address: row.recipientAddress,
          chainId: row.recipientChainId,
        },
        theme,
        successUrl: row.successUrl ?? undefined,
        cancelUrl: row.cancelUrl ?? undefined,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt ?? undefined,
        metadata,
      };

      return { session };
    });
  }
}
