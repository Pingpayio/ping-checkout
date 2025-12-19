import { Effect } from 'every-plugin/effect';
import type { Database } from '../db';
import type {
  CreateCheckoutSessionInput,
  CreateCheckoutSessionResponse,
  GetCheckoutSessionInput,
  GetCheckoutSessionResponse,
  CheckoutSession,
} from '../schema';
import { randomBytes } from 'crypto';

/**
 * TEMPORARY: Local in-memory session store (no DB).
 * - Lost on restart
 * - Not shared across instances
 */
type StoredSession = {
  merchantId: string;
  session: CheckoutSession;
};

const inMemorySessions = new Map<string, StoredSession>();

function isExpired(expiresAt: string | undefined): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) ? t <= Date.now() : false;
}

function buildCheckoutUrl(sessionId: string): string {
  const base = (process.env.CHECKOUT_UI_BASE_URL || 'http://localhost:3002').replace(/\/$/, '');
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
  // Keep DB injected to avoid wider refactors; it is unused while in-memory mode is enabled.
  constructor(private db: Database) {}

  createSession(
    merchantId: string,
    input: CreateCheckoutSessionInput
  ): Effect.Effect<CreateCheckoutSessionResponse, Error> {
    return Effect.gen(this, function* (_) {
      const sessionId = `cs_${randomBytes(16).toString('hex')}`;
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      const session: CheckoutSession = {
        sessionId,
        status: 'CREATED',
        paymentId: null,
        amount: input.amount,
        recipient: input.recipient,
        theme: input.theme,
        // Response schema expects optional strings (undefined when absent), not nulls
        successUrl: input.successUrl ?? undefined,
        cancelUrl: input.cancelUrl ?? undefined,
        createdAt: now,
        expiresAt,
        metadata: input.metadata,
      };

      // Store locally instead of DB
      inMemorySessions.set(sessionId, { merchantId, session });

      // Point to the local checkout UI in this repo by default.
      // Override via CHECKOUT_UI_BASE_URL for other environments.
      const sessionUrl = buildCheckoutUrl(sessionId);

      return { session, sessionUrl };
    });
  }

  getSession(
    merchantId: string,
    input: GetCheckoutSessionInput
  ): Effect.Effect<GetCheckoutSessionResponse, CheckoutSessionNotFoundError | Error> {
    return Effect.gen(this, function* (_) {
      const stored = inMemorySessions.get(input.sessionId);
      if (!stored || stored.merchantId !== merchantId) {
        return yield* _(Effect.fail(new CheckoutSessionNotFoundError(input.sessionId)));
      }

      if (isExpired(stored.session.expiresAt)) {
        // mark expired + evict
        const expired: CheckoutSession = { ...stored.session, status: 'EXPIRED' };
        inMemorySessions.delete(input.sessionId);
        return { session: expired };
      }

      return { session: stored.session };
    });
  }
}
