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
const CHECKOUT_INSTANCE_ID = `checkout-${randomBytes(4).toString('hex')}`;
console.log(`[checkout] in-memory store enabled (instance=${CHECKOUT_INSTANCE_ID})`);

// In-memory sessions keyed by sessionId (merchant-agnostic in dev mode)
const inMemorySessions = new Map<string, CheckoutSession>();

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
  // Keep DB injected to avoid wider refactors; it is unused while in-memory mode is enabled.
  constructor(private db: Database) {}

  createSession(
    merchantId: string,
    input: CreateCheckoutSessionInput
  ): Effect.Effect<CreateCheckoutSessionResponse, Error> {
    return Effect.gen(this, function* (_) {
      // TODO: use db to create session
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
      inMemorySessions.set(sessionId, session);

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
      // TEMPORARY (in-memory mode): do not scope reads by merchant.
      if (!stored) {
        console.log(
          `[checkout] session not found ${input.sessionId} (instance=${CHECKOUT_INSTANCE_ID}, count=${inMemorySessions.size})`
        );
        return yield* _(Effect.fail(new CheckoutSessionNotFoundError(input.sessionId)));
      }

      if (isExpired(stored.expiresAt)) {
        // mark expired + evict
        const expired: CheckoutSession = { ...stored, status: 'EXPIRED' };
        inMemorySessions.delete(input.sessionId);
        console.log(
          `[checkout] session expired ${input.sessionId} (instance=${CHECKOUT_INSTANCE_ID}, count=${inMemorySessions.size})`
        );
        return { session: expired };
      }
      return { session: stored };
    });
  }
}
