import crypto from 'crypto';
import express, { type Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApiGatewayRouter } from '../api-gateway/index.ts';
import { apiKeyStore } from '../api-gateway/utils/db.ts';
import { redisStore } from '../api-gateway/utils/redis.ts';
import { db, migrate } from '../src/db/sqlite.js';
import * as webhookService from '../core/webhooks/webhookService.ts';

const SECRET = 'secret-key';

function makeApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createApiGatewayRouter());
  return app;
}

function makeHmac(method: string, path: string, body: string, nonce: string) {
  const raw = nonce + method + path + body;
  return crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
}

describe('Webhooks API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    redisStore.__clear();
    migrate();
    db.exec('DELETE FROM webhook_subscriptions');
  });

  function mockWriteApiKey(merchantId: string = 'merchant-webhook') {
    const record = {
      id: 'key-webhook',
      key: 'sk_webhook_123',
      merchantId,
      scopes: ['webhooks:write'],
      revokedAt: null,
      type: 'secret' as const,
      secret: SECRET,
    };
    vi.spyOn(apiKeyStore, 'findActiveByKey').mockResolvedValue(record);
    return record;
  }

  describe('POST /webhooks', () => {
    it('creates webhook with valid middleware stack', async () => {
      const apiKey = mockWriteApiKey();
      const idempotencyKey = crypto.randomUUID();
      const body = { url: 'https://example.com/webhooks/ping' };
      const bodyStr = JSON.stringify(body);
      const nonce = crypto.randomUUID();
      const signature = makeHmac('POST', '/api/v1/webhooks', bodyStr, nonce);

      const app = makeApp();
      const res = await request(app)
        .post('/api/v1/webhooks')
        .set('X-Ping-Api-Key', apiKey.key)
        .set('X-Ping-Nonce', nonce)
        .set('X-Ping-Signature', signature)
        .set('Idempotency-Key', idempotencyKey)
        .send(body);

      expect(res.status).toBe(201);
      expect(res.body.webhook).toMatchObject({
        webhookId: expect.stringMatching(/^wh_/),
        url: body.url,
        createdAt: expect.any(String),
        disabledAt: null,
      });

      const { n } = db.prepare('SELECT COUNT(1) AS n FROM webhook_subscriptions').get();
      expect(n).toBe(1);
    });

    it('replays cached response for duplicate idempotency key', async () => {
      const apiKey = mockWriteApiKey();
      const idempotencyKey = crypto.randomUUID();
      const body = { url: 'https://example.com/webhooks/ping' };
      const bodyStr = JSON.stringify(body);
      const nonce = crypto.randomUUID();
      const signature = makeHmac('POST', '/api/v1/webhooks', bodyStr, nonce);

      const app = makeApp();
      const first = await request(app)
        .post('/api/v1/webhooks')
        .set('X-Ping-Api-Key', apiKey.key)
        .set('X-Ping-Nonce', nonce)
        .set('X-Ping-Signature', signature)
        .set('Idempotency-Key', idempotencyKey)
        .send(body);

      expect(first.status).toBe(201);

      const second = await request(app)
        .post('/api/v1/webhooks')
        .set('X-Ping-Api-Key', apiKey.key)
        .set('X-Ping-Nonce', nonce)
        .set('X-Ping-Signature', signature)
        .set('Idempotency-Key', idempotencyKey)
        .send(body);

      expect(second.status).toBe(201);
      expect(second.body).toEqual(first.body);
    });

    it('rejects invalid URL', async () => {
      const apiKey = mockWriteApiKey();
      const nonce = crypto.randomUUID();
      const body = { url: 'not-a-url' };
      const bodyStr = JSON.stringify(body);
      const signature = makeHmac('POST', '/api/v1/webhooks', bodyStr, nonce);

      const app = makeApp();
      const res = await request(app)
        .post('/api/v1/webhooks')
        .set('X-Ping-Api-Key', apiKey.key)
        .set('X-Ping-Nonce', nonce)
        .set('X-Ping-Signature', signature)
        .set('Idempotency-Key', crypto.randomUUID())
        .send(body);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_PARAMS');
    });

    it('rejects missing API key', async () => {
      const app = makeApp();
      const res = await request(app)
        .post('/api/v1/webhooks')
        .send({ url: 'https://example.com/webhooks/ping' });

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /webhooks/:webhookId', () => {
    async function seedWebhook(merchantId: string) {
      const webhook = await webhookService.createWebhook(
        merchantId,
        'https://example.com/webhooks/ping',
      );
      return webhook;
    }

    it('deletes webhook for same merchant', async () => {
      const merchantId = 'merchant-delete';
      const webhook = await seedWebhook(merchantId);
      const apiKey = mockWriteApiKey(merchantId);
      const app = makeApp();

      const res = await request(app)
        .delete(`/api/v1/webhooks/${webhook.id}`)
        .set('X-Ping-Api-Key', apiKey.key);

      expect(res.status).toBe(204);

      const row = db
        .prepare('SELECT * FROM webhook_subscriptions WHERE id = ?')
        .get(webhook.id);
      expect(row?.deleted_at).toBeTruthy();
    });

    it('returns 404 for missing webhook', async () => {
      const apiKey = mockWriteApiKey('merchant-notfound');
      const app = makeApp();

      const res = await request(app)
        .delete('/api/v1/webhooks/wh_nonexistent')
        .set('X-Ping-Api-Key', apiKey.key);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('returns 404 for webhook owned by different merchant', async () => {
      const webhook = await seedWebhook('merchant-owner');
      const apiKey = mockWriteApiKey('merchant-other');
      const app = makeApp();

      const res = await request(app)
        .delete(`/api/v1/webhooks/${webhook.id}`)
        .set('X-Ping-Api-Key', apiKey.key);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /webhooks/test', () => {
    it('sends test webhook successfully', async () => {
      const apiKey = mockWriteApiKey();
      const merchantId = apiKey.merchantId;
      const webhook = await webhookService.createWebhook(
        merchantId,
        'https://example.com/webhooks/ping',
      );

      const idempotencyKey = crypto.randomUUID();
      const body = { webhookId: webhook.id };
      const bodyStr = JSON.stringify(body);
      const nonce = crypto.randomUUID();
      const signature = makeHmac('POST', '/api/v1/webhooks/test', bodyStr, nonce);

      const app = makeApp();
      const res = await request(app)
        .post('/api/v1/webhooks/test')
        .set('X-Ping-Api-Key', apiKey.key)
        .set('X-Ping-Nonce', nonce)
        .set('X-Ping-Signature', signature)
        .set('Idempotency-Key', idempotencyKey)
        .send(body);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        message: 'Test webhook sent successfully',
      });
    });

    it('returns 404 for missing webhook', async () => {
      const apiKey = mockWriteApiKey();
      const idempotencyKey = crypto.randomUUID();
      const body = { webhookId: 'wh_nonexistent' };
      const bodyStr = JSON.stringify(body);
      const nonce = crypto.randomUUID();
      const signature = makeHmac('POST', '/api/v1/webhooks/test', bodyStr, nonce);

      const app = makeApp();
      const res = await request(app)
        .post('/api/v1/webhooks/test')
        .set('X-Ping-Api-Key', apiKey.key)
        .set('X-Ping-Nonce', nonce)
        .set('X-Ping-Signature', signature)
        .set('Idempotency-Key', idempotencyKey)
        .send(body);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('replays cached response for duplicate idempotency key', async () => {
      const apiKey = mockWriteApiKey();
      const merchantId = apiKey.merchantId;
      const webhook = await webhookService.createWebhook(
        merchantId,
        'https://example.com/webhooks/ping',
      );

      const idempotencyKey = crypto.randomUUID();
      const body = { webhookId: webhook.id };
      const bodyStr = JSON.stringify(body);
      const nonce = crypto.randomUUID();
      const signature = makeHmac('POST', '/api/v1/webhooks/test', bodyStr, nonce);

      const app = makeApp();
      const first = await request(app)
        .post('/api/v1/webhooks/test')
        .set('X-Ping-Api-Key', apiKey.key)
        .set('X-Ping-Nonce', nonce)
        .set('X-Ping-Signature', signature)
        .set('Idempotency-Key', idempotencyKey)
        .send(body);

      expect(first.status).toBe(200);

      const second = await request(app)
        .post('/api/v1/webhooks/test')
        .set('X-Ping-Api-Key', apiKey.key)
        .set('X-Ping-Nonce', nonce)
        .set('X-Ping-Signature', signature)
        .set('Idempotency-Key', idempotencyKey)
        .send(body);

      expect(second.status).toBe(200);
      expect(second.body).toEqual(first.body);
    });
  });
});


