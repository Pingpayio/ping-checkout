import { Effect } from 'every-plugin/effect';
import { eq, and } from 'drizzle-orm';
import type { Database } from '../db';
import type {
  CreateCheckoutSessionInput,
  CreateCheckoutSessionResponse,
  GetCheckoutSessionInput,
  GetCheckoutSessionResponse,
  CheckoutSession,
} from '../schema';
import { randomBytes } from 'crypto';
import { checkoutSessions } from '../db/schema';
import { resolveAssetId } from './oneclick-tokens';

function isExpired(expiresAt: string | undefined): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) ? t <= Date.now() : false;
}

function buildCheckoutUrl(sessionId: string): string {
  // Default to the host app port in this repo (host runs on 3001).
  const base = (process.env.CHECKOUT_UI_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
  const url = new URL(`${base}/checkout`);
  url.searchParams.set('sessionId', sessionId);
  return url.toString();
}

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
      // Resolve assetId from chain and symbol
      const assetId = yield* _(resolveAssetId(input.asset.symbol, input.asset.chain));
      
      const sessionId = `cs_${randomBytes(16).toString('hex')}`;
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      const themeJson = input.theme ? JSON.stringify(input.theme) : null;
      const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

      // Transform input to internal format
      const amount = {
        assetId,
        amount: input.amount,
      };

      yield* _(
        Effect.tryPromise({
          try: () =>
            this.db.insert(checkoutSessions).values({
              id: sessionId,
              merchantId,
              amountAssetId: amount.assetId,
              amountValue: amount.amount,
              recipientAddress: input.recipient.address,
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
        amount,
        recipient: input.recipient,
        theme: input.theme,
        successUrl: input.successUrl ?? undefined,
        cancelUrl: input.cancelUrl ?? undefined,
        createdAt: now,
        expiresAt,
        metadata: input.metadata,
      };

      const sessionUrl = buildCheckoutUrl(sessionId);

      return { session, sessionUrl };
    });
  }

  getSession(
    merchantId: string,
    input: GetCheckoutSessionInput
  ): Effect.Effect<GetCheckoutSessionResponse, CheckoutSessionNotFoundError | Error> {
    return Effect.gen(this, function* (_) {
      const row = yield* _(
        Effect.tryPromise({
          try: () =>
            this.db
              .select()
              .from(checkoutSessions)
              .where(
                and(
                  eq(checkoutSessions.id, input.sessionId),
                  eq(checkoutSessions.merchantId, merchantId)
                )
              )
              .get(),
          catch: (error) => new Error(`Failed to get session: ${error}`),
        })
      );

      if (!row) {
        return yield* _(Effect.fail(new CheckoutSessionNotFoundError(input.sessionId)));
      }

      const theme = row.themeJson ? JSON.parse(row.themeJson) : undefined;
      const metadata = row.metadataJson ? JSON.parse(row.metadataJson) : undefined;

      let status = row.status as CheckoutSession['status'];

      if (status !== 'EXPIRED' && isExpired(row.expiresAt ?? undefined)) {
        status = 'EXPIRED';
        yield* _(
          Effect.tryPromise({
            try: () =>
              this.db
                .update(checkoutSessions)
                .set({ status: 'EXPIRED' })
                .where(eq(checkoutSessions.id, input.sessionId)),
            catch: (error) => new Error(`Failed to update expired session: ${error}`),
          })
        );
      }

      const session: CheckoutSession = {
        sessionId: row.id,
        status,
        paymentId: row.paymentId ?? null,
        amount: {
          assetId: row.amountAssetId,
          amount: row.amountValue,
        },
        recipient: {
          address: row.recipientAddress,
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
