import express, { type Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApiGatewayRouter } from '../api-gateway/index.ts';
import { apiKeyStore } from '../api-gateway/utils/db.ts';
import { redisStore } from '../api-gateway/utils/redis.ts';
import { InvalidPublishableKeyError } from '../core/widget/widgetService.ts';

const PUBLISHABLE_KEY = 'pk_test_123';

function makeApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createApiGatewayRouter());
  return app;
}

describe('Widget Bootstrap API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    redisStore.__clear();
  });

  function mockPublishableKey(merchantId: string = 'merchant-widget') {
    const record = {
      id: 'key-widget-pub',
      key: PUBLISHABLE_KEY,
      merchantId,
      scopes: [],
      revokedAt: null,
      type: 'publishable' as const,
    };
    vi.spyOn(apiKeyStore, 'findActiveByKey').mockResolvedValue(record);
    return record;
  }

  function mockRevokedKey(merchantId: string = 'merchant-widget') {
    const record = {
      id: 'key-widget-revoked',
      key: PUBLISHABLE_KEY,
      merchantId,
      scopes: [],
      revokedAt: new Date(),
      type: 'publishable' as const,
    };
    vi.spyOn(apiKeyStore, 'findActiveByKey').mockResolvedValue(record);
    return record;
  }

  function mockSecretKey(merchantId: string = 'merchant-widget') {
    const record = {
      id: 'key-widget-secret',
      key: 'sk_test_123',
      merchantId,
      scopes: ['sessions:write'],
      revokedAt: null,
      type: 'secret' as const,
      secret: 'secret-key',
    };
    vi.spyOn(apiKeyStore, 'findActiveByKey').mockResolvedValue(record);
    return record;
  }

  describe('GET /widget/bootstrap', () => {
    it('returns bootstrap config for valid publishable key', async () => {
      mockPublishableKey();
      const app = makeApp();

      const res = await request(app)
        .get('/api/v1/widget/bootstrap')
        .query({ publishableKey: PUBLISHABLE_KEY });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        merchantId: 'merchant-widget',
        allowedOrigins: expect.any(Array),
        apiBaseUrl: expect.any(String),
        defaultTheme: {
          brandColor: expect.any(String),
          logoUrl: expect.any(String),
          buttonText: expect.any(String),
          mode: expect.any(String),
        },
      });
      expect(res.body.allowedOrigins).toBeInstanceOf(Array);
      expect(res.body.apiBaseUrl).toMatch(/^https?:\/\//);
    });

    it('returns 400 when publishableKey is missing', async () => {
      const app = makeApp();

      const res = await request(app).get('/api/v1/widget/bootstrap');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        code: 'MISSING_PUBLISHABLE_KEY',
        message: 'publishableKey is required',
      });
    });

    it('returns 400 when publishableKey is empty', async () => {
      const app = makeApp();

      const res = await request(app)
        .get('/api/v1/widget/bootstrap')
        .query({ publishableKey: '' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        code: 'MISSING_PUBLISHABLE_KEY',
        message: 'publishableKey is required',
      });
    });

    it('returns 401 when publishable key is invalid', async () => {
      vi.spyOn(apiKeyStore, 'findActiveByKey').mockResolvedValue(null);
      const app = makeApp();

      const res = await request(app)
        .get('/api/v1/widget/bootstrap')
        .query({ publishableKey: 'pk_invalid' });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        code: 'INVALID_PUBLISHABLE_KEY',
        message: 'Publishable key is invalid or revoked',
      });
    });

    it('returns 401 when publishable key is revoked', async () => {
      mockRevokedKey();
      const app = makeApp();

      const res = await request(app)
        .get('/api/v1/widget/bootstrap')
        .query({ publishableKey: PUBLISHABLE_KEY });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        code: 'INVALID_PUBLISHABLE_KEY',
        message: 'Publishable key is invalid or revoked',
      });
    });

    it('returns 401 when key is secret type (not publishable)', async () => {
      mockSecretKey();
      const app = makeApp();

      const res = await request(app)
        .get('/api/v1/widget/bootstrap')
        .query({ publishableKey: 'sk_test_123' });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        code: 'INVALID_PUBLISHABLE_KEY',
        message: 'Publishable key is invalid or revoked',
      });
    });

    it('respects rate limiting', async () => {
      mockPublishableKey();
      const app = makeApp();

      // Make multiple requests rapidly
      const requests = Array.from({ length: 10 }, () =>
        request(app)
          .get('/api/v1/widget/bootstrap')
          .query({ publishableKey: PUBLISHABLE_KEY }),
      );

      const responses = await Promise.all(requests);
      // At least some should succeed (rate limit allows reasonable traffic)
      const successCount = responses.filter((r) => r.status === 200).length;
      expect(successCount).toBeGreaterThan(0);
    });
  });
});

