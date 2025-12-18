import crypto from 'crypto';
import express, { type Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApiGatewayRouter } from '../api-gateway/index.ts';
import { apiKeyStore } from '../api-gateway/utils/db.ts';
import { redisStore } from '../api-gateway/utils/redis.ts';
import { db, migrate } from '../src/db/sqlite.js';
import * as paymentService from '../core/payments/paymentService.ts';

const SECRET = 'secret-key';

function makeApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createApiGatewayRouter());
  return app;
}

function makeHmac(nonce: string, method: string, path: string, body: string): string {
  const raw = nonce + method + path + body;
  return crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
}

describe('Payments API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    redisStore.__clear();
    migrate();
    db.exec('DELETE FROM payments');
  });

  const baseRequest = {
    payer: { address: 'payer.near', chainId: 'near:mainnet' },
    recipient: { address: 'merchant.near', chainId: 'near:mainnet' },
    asset: { assetId: 'nep141:usdc.near', amount: '1000000' },
    memo: 'demo payment',
  };

  function mockWriteApiKey() {
    const record = {
      id: 'key-pay',
      key: 'sk_pay_123',
      merchantId: 'merchant-prepare',
      scopes: ['payments:write'],
      revokedAt: null,
      type: 'secret' as const,
      secret: SECRET,
    };
    vi.spyOn(apiKeyStore, 'findActiveByKey').mockResolvedValue(record);
    return record;
  }

  it('creates payment with valid middleware stack', async () => {
    const apiKey = mockWriteApiKey();
    const idempotencyKey = crypto.randomUUID();
    const body = {
      request: {
        ...baseRequest,
        idempotencyKey,
      },
    };
    const bodyStr = JSON.stringify(body);
    const nonce = crypto.randomUUID();
    const signature = makeHmac(nonce, 'POST', '/api/v1/payments/prepare', bodyStr);

    const app = makeApp();
    const res = await request(app)
      .post('/api/v1/payments/prepare')
      .set('X-Ping-Api-Key', apiKey.key)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature)
      .set('Idempotency-Key', idempotencyKey)
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.payment).toMatchObject({
      paymentId: expect.stringMatching(/^pay_/),
      status: 'PENDING',
      request: body.request,
    });
    expect(res.body.payment.createdAt).toBeDefined();

    const { n } = db.prepare('SELECT COUNT(1) AS n FROM payments').get();
    expect(n).toBe(1);
  });

  it('replays cached response for duplicate idempotency key', async () => {
    const apiKey = mockWriteApiKey();
    const idempotencyKey = crypto.randomUUID();
    const body = {
      request: {
        ...baseRequest,
        idempotencyKey,
      },
    };
    const bodyStr = JSON.stringify(body);
    const nonce = crypto.randomUUID();
    const signature = makeHmac(nonce, 'POST', '/api/v1/payments/prepare', bodyStr);

    const app = makeApp();
    const first = await request(app)
      .post('/api/v1/payments/prepare')
      .set('X-Ping-Api-Key', apiKey.key)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature)
      .set('Idempotency-Key', idempotencyKey)
      .send(body);

    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/v1/payments/prepare')
      .set('X-Ping-Api-Key', apiKey.key)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature)
      .set('Idempotency-Key', idempotencyKey)
      .send(body);

    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
  });

  it('rejects invalid payloads', async () => {
    const apiKey = mockWriteApiKey();
    const nonce = crypto.randomUUID();
    const body = { bad: true };
    const bodyStr = JSON.stringify(body);
    const signature = makeHmac(nonce, 'POST', '/api/v1/payments/prepare', bodyStr);

    const app = makeApp();
    const res = await request(app)
      .post('/api/v1/payments/prepare')
      .set('X-Ping-Api-Key', apiKey.key)
      .set('X-Ping-Nonce', nonce)
      .set('X-Ping-Signature', signature)
      .set('Idempotency-Key', crypto.randomUUID())
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PARAMS');
  });

  describe('GET /payments/:paymentId', () => {
    function mockReadApiKey(merchantId: string) {
      const record = {
        id: `key-read-${merchantId}`,
        key: `pk_read_${merchantId}`,
        merchantId,
        scopes: ['payments:read'],
        revokedAt: null,
        type: 'secret' as const,
        secret: SECRET,
      };
      vi.spyOn(apiKeyStore, 'findActiveByKey').mockResolvedValue(record);
      return record;
    }

    it('returns payment for same merchant', async () => {
      const merchantId = 'merchant-read';
      const paymentRequest = {
        payer: baseRequest.payer,
        recipient: baseRequest.recipient,
        asset: baseRequest.asset,
        memo: 'read test',
        idempotencyKey: crypto.randomUUID(),
      };
      const { payment } = await paymentService.preparePayment(merchantId, paymentRequest);

      const apiKey = mockReadApiKey(merchantId);

      const app = makeApp();
      const res = await request(app)
        .get(`/api/v1/payments/${payment.id}`)
        .set('X-Ping-Api-Key', apiKey.key);

      expect(res.status).toBe(200);
      expect(res.body.payment).toMatchObject({
        paymentId: payment.id,
        status: payment.status,
      });
    });

    it('returns 404 for missing payment', async () => {
      const merchantId = 'merchant-missing';
      const apiKey = mockReadApiKey(merchantId);
      const app = makeApp();

      const res = await request(app)
        .get('/api/v1/payments/pay_unknown')
        .set('X-Ping-Api-Key', apiKey.key);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('returns 404 for payment owned by different merchant', async () => {
      const paymentRequest = {
        payer: baseRequest.payer,
        recipient: baseRequest.recipient,
        asset: baseRequest.asset,
        memo: 'wrong merchant',
        idempotencyKey: crypto.randomUUID(),
      };
      const { payment } = await paymentService.preparePayment('merchant-owner', paymentRequest);

      const apiKey = mockReadApiKey('merchant-other');
      const app = makeApp();

      const res = await request(app)
        .get(`/api/v1/payments/${payment.id}`)
        .set('X-Ping-Api-Key', apiKey.key);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /payments/submit', () => {
    function mockSubmitApiKey() {
      const record = {
        id: 'key-submit',
        key: 'sk_submit_123',
        merchantId: 'merchant-submit',
        scopes: ['payments:write'],
        revokedAt: null,
        type: 'secret' as const,
        secret: SECRET,
      };
      vi.spyOn(apiKeyStore, 'findActiveByKey').mockResolvedValue(record);
      return record;
    }

    async function seedPayment(status: "PENDING" | "SUCCESS" = "PENDING") {
      const req = {
        payer: baseRequest.payer,
        recipient: baseRequest.recipient,
        asset: baseRequest.asset,
        memo: 'submit test',
        idempotencyKey: crypto.randomUUID(),
      };
      const { payment } = await paymentService.preparePayment('merchant-submit', req);
      if (status !== "PENDING") {
        db.prepare('UPDATE payments SET status = ? WHERE id = ?').run(status, payment.id);
      }
      return payment;
    }

    function signedHeaders(body: unknown, path: string) {
      const nonce = crypto.randomUUID();
      const bodyStr = JSON.stringify(body);
      const signature = makeHmac(nonce, 'POST', path, bodyStr);
      return { nonce, signature, bodyStr };
    }

    it('submits payment successfully', async () => {
      const payment = await seedPayment();
      const apiKey = mockSubmitApiKey();
      vi.spyOn(paymentService, 'submitPayment').mockResolvedValue({
        ...payment,
        status: 'SUCCESS',
      });
      const body = {
        paymentId: payment.id,
        signedPayload: { proof: 'demo' },
        idempotencyKey: crypto.randomUUID(),
      };
      const { nonce, signature } = signedHeaders(body, '/api/v1/payments/submit');

      const app = makeApp();
      const res = await request(app)
        .post('/api/v1/payments/submit')
        .set('X-Ping-Api-Key', apiKey.key)
        .set('X-Ping-Nonce', nonce)
        .set('X-Ping-Signature', signature)
        .set('Idempotency-Key', body.idempotencyKey)
        .send(body);

      expect(res.status).toBe(200);
      expect(res.body.payment.paymentId).toBe(payment.id);
      expect(paymentService.submitPayment).toHaveBeenCalledWith(
        'merchant-submit',
        payment.id,
        body.signedPayload,
      );
    });

    it('returns 404 for missing payment', async () => {
      const apiKey = mockSubmitApiKey();
      vi.spyOn(paymentService, 'submitPayment').mockRejectedValue(
        new Error('PAYMENT_NOT_FOUND'),
      );
      const body = {
        paymentId: 'pay_missing',
        signedPayload: {},
        idempotencyKey: crypto.randomUUID(),
      };
      const { nonce, signature } = signedHeaders(body, '/api/v1/payments/submit');

      const app = makeApp();
      const res = await request(app)
        .post('/api/v1/payments/submit')
        .set('X-Ping-Api-Key', apiKey.key)
        .set('X-Ping-Nonce', nonce)
        .set('X-Ping-Signature', signature)
        .set('Idempotency-Key', body.idempotencyKey)
        .send(body);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('returns 409 when payment already finalized', async () => {
      const payment = await seedPayment("SUCCESS");
      const apiKey = mockSubmitApiKey();
      vi.spyOn(paymentService, 'submitPayment').mockRejectedValue(
        new Error('PAYMENT_ALREADY_FINALIZED'),
      );
      const body = {
        paymentId: payment.id,
        signedPayload: {},
        idempotencyKey: crypto.randomUUID(),
      };
      const { nonce, signature } = signedHeaders(body, '/api/v1/payments/submit');

      const app = makeApp();
      const res = await request(app)
        .post('/api/v1/payments/submit')
        .set('X-Ping-Api-Key', apiKey.key)
        .set('X-Ping-Nonce', nonce)
        .set('X-Ping-Signature', signature)
        .set('Idempotency-Key', body.idempotencyKey)
        .send(body);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PAYMENT_ALREADY_FINALIZED');
    });
  });
});

