import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getPluginClient, teardown } from './setup';
import { createDatabase } from '@/db';
import { checkoutSessions } from '@/db/schema';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = createDatabase('file:test.db');

describe('Checkout Sessions', () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: join(__dirname, '../src/db/migrations') });
    await db.delete(checkoutSessions);
  });

  beforeEach(async () => {
    await db.delete(checkoutSessions);
  });

  afterAll(async () => {
    await teardown();
  });

  const validRequest = {
    amount: '1000000',
    recipient: { address: 'merchant.near' },
    asset: { chain: 'NEAR', symbol: 'USDC' },
    theme: { brandColor: '#FF0000' },
    successUrl: 'https://example.com/success',
    cancelUrl: 'https://example.com/cancel',
  };

  describe('POST /checkout/sessions', () => {
    it('creates session with valid request', async () => {
      const client = await getPluginClient();
      
      const result = await client.checkout.createSession(validRequest);

      expect(result.session).toMatchObject({
        sessionId: expect.stringMatching(/^cs_/),
        status: 'CREATED',
        amount: {
          assetId: expect.any(String),
          amount: validRequest.amount,
        },
        recipient: validRequest.recipient,
        theme: validRequest.theme,
        successUrl: validRequest.successUrl,
        cancelUrl: validRequest.cancelUrl,
      });
      expect(result.session.createdAt).toBeDefined();
      expect(result.session.expiresAt).toBeDefined();
      expect(result.sessionUrl).toMatch(/^https:\/\//);
      expect(result.sessionUrl).toContain(result.session.sessionId);

      const rows = await db.select().from(checkoutSessions);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.status).toBe('CREATED');
    });

    it('creates session without optional fields', async () => {
      const client = await getPluginClient();
      const minimalRequest = {
        amount: '1000000',
        recipient: { address: 'merchant.near' },
        asset: { chain: 'NEAR', symbol: 'USDC' },
      };

      const result = await client.checkout.createSession(minimalRequest);

      expect(result.session.sessionId).toMatch(/^cs_/);
      expect(result.session.status).toBe('CREATED');
      expect(result.session.theme).toBeUndefined();
      expect(result.session.successUrl).toBeUndefined();
      expect(result.session.cancelUrl).toBeUndefined();
    });

    it('rejects invalid amount (non-numeric string)', async () => {
      const client = await getPluginClient();
      const invalidRequest = {
        amount: 'invalid',
        recipient: { address: 'merchant.near' },
        asset: { chain: 'NEAR', symbol: 'USDC' },
      };

      await expect(
        client.checkout.createSession(invalidRequest as any)
      ).rejects.toThrow();
    });

    it('rejects missing recipient', async () => {
      const client = await getPluginClient();
      const invalidRequest = {
        amount: '1000000',
        asset: { chain: 'NEAR', symbol: 'USDC' },
      };

      await expect(
        client.checkout.createSession(invalidRequest as any)
      ).rejects.toThrow();
    });

    it('rejects invalid URL format for successUrl', async () => {
      const client = await getPluginClient();
      const invalidRequest = {
        ...validRequest,
        successUrl: 'not-a-url',
      };

      await expect(
        client.checkout.createSession(invalidRequest as any)
      ).rejects.toThrow();
    });

    it('includes metadata when provided', async () => {
      const client = await getPluginClient();
      const requestWithMetadata = {
        ...validRequest,
        metadata: { orderId: '12345', customerId: 'cust_67890' },
      };

      const result = await client.checkout.createSession(requestWithMetadata);

      expect(result.session.metadata).toEqual(requestWithMetadata.metadata);
    });
  });

  describe('GET /checkout/sessions/:sessionId', () => {
    it('returns session by id', async () => {
      const client = await getPluginClient();
      
      const created = await client.checkout.createSession(validRequest);
      const sessionId = created.session.sessionId;

      const result = await client.checkout.getSession({ sessionId });

      expect(result.session).toMatchObject({
        sessionId,
        status: 'CREATED',
        amount: {
          assetId: expect.any(String),
          amount: validRequest.amount,
        },
        recipient: validRequest.recipient,
      });
    });

    it('returns 404 for non-existent session', async () => {
      const client = await getPluginClient();

      await expect(
        client.checkout.getSession({ sessionId: 'cs_nonexistent' })
      ).rejects.toThrow(/not found/i);
    });

    it('returns session with all fields populated', async () => {
      const client = await getPluginClient();
      const fullRequest = {
        ...validRequest,
        metadata: { orderId: 'test-order' },
      };

      const created = await client.checkout.createSession(fullRequest);
      const result = await client.checkout.getSession({ 
        sessionId: created.session.sessionId 
      });

      expect(result.session).toMatchObject({
        sessionId: created.session.sessionId,
        status: 'CREATED',
        amount: {
          assetId: expect.any(String),
          amount: fullRequest.amount,
        },
        recipient: fullRequest.recipient,
        theme: fullRequest.theme,
        successUrl: fullRequest.successUrl,
        cancelUrl: fullRequest.cancelUrl,
        metadata: fullRequest.metadata,
      });
      expect(result.session.paymentId).toBeNull();
      expect(result.session.createdAt).toBeDefined();
      expect(result.session.expiresAt).toBeDefined();
    });
  });

  describe('Session expiry', () => {
    it('sets expiry time 1 hour in the future', async () => {
      const client = await getPluginClient();
      
      const beforeCreate = Date.now();
      const result = await client.checkout.createSession(validRequest);
      const afterCreate = Date.now();

      expect(result.session.expiresAt).toBeDefined();
      const expiresAt = new Date(result.session.expiresAt!).getTime();
      
      const oneHourFromBefore = beforeCreate + 60 * 60 * 1000;
      const oneHourFromAfter = afterCreate + 60 * 60 * 1000;

      expect(expiresAt).toBeGreaterThanOrEqual(oneHourFromBefore);
      expect(expiresAt).toBeLessThanOrEqual(oneHourFromAfter);
    });
  });

  describe('Session ID generation', () => {
    it('generates unique session IDs', async () => {
      const client = await getPluginClient();
      
      const result1 = await client.checkout.createSession(validRequest);
      const result2 = await client.checkout.createSession(validRequest);

      expect(result1.session.sessionId).not.toBe(result2.session.sessionId);
      expect(result1.session.sessionId).toMatch(/^cs_/);
      expect(result2.session.sessionId).toMatch(/^cs_/);
    });
  });
});
