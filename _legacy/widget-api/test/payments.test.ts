import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  type PaymentRequest,
  getPaymentById,
  preparePayment,
} from '../core/payments/paymentService.ts';
import { db, migrate } from '../src/db/sqlite.js';

describe('preparePayment', () => {
  beforeAll(() => {
    migrate();
  });

  beforeEach(() => {
    db.prepare('DELETE FROM payments').run();
  });

  function makeRequest(overrides: Partial<PaymentRequest> = {}): PaymentRequest {
    return {
      payer: {
        address: 'payer.near',
        chainId: 'near:mainnet',
      },
      recipient: {
        address: 'merchant.near',
        chainId: 'near:mainnet',
      },
      asset: {
        assetId: 'usdc.near',
        amount: '1000000',
      },
      memo: 'demo payment',
      idempotencyKey: 'idem-123',
      ...overrides,
    };
  }

  it('creates a new payment record when none exists', async () => {
    const request = makeRequest();

    const result = await preparePayment('merchant-1', request);

    expect(result.feeQuote).toBeUndefined();
    expect(result.payment.merchantId).toBe('merchant-1');
    expect(result.payment.status).toBe('PENDING');
    expect(result.payment.request.asset).toEqual(request.asset);
    expect(result.payment.request.payer).toEqual(request.payer);
    expect(result.payment.request.recipient).toEqual(request.recipient);
    expect(result.payment.request.idempotencyKey).toBe(request.idempotencyKey);

    const { n } = db.prepare('SELECT COUNT(1) AS n FROM payments').get();
    expect(n).toBe(1);
  });

  it('returns existing payment for same merchant + idempotency key', async () => {
    const request = makeRequest({ idempotencyKey: 'reuse-1' });

    const first = await preparePayment('merchant-2', request);
    const second = await preparePayment('merchant-2', request);

    expect(second.payment.id).toBe(first.payment.id);
    expect(second.payment.createdAt).toBe(first.payment.createdAt);

    const { n } = db.prepare('SELECT COUNT(1) AS n FROM payments').get();
    expect(n).toBe(1);
  });

  it('fetches payment by id scoped to merchant', async () => {
    const request = makeRequest({ idempotencyKey: 'fetch-1' });
    const { payment } = await preparePayment('merchant-3', request);

    const found = await getPaymentById('merchant-3', payment.id);

    expect(found).not.toBeNull();
    expect(found?.id).toBe(payment.id);
    expect(found?.merchantId).toBe('merchant-3');
  });

  it('returns null when merchant does not own payment', async () => {
    const request = makeRequest({ idempotencyKey: 'fetch-2' });
    const { payment } = await preparePayment('merchant-4', request);

    const found = await getPaymentById('merchant-other', payment.id);

    expect(found).toBeNull();
  });
});

