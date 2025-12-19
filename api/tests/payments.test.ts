import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPluginClient, teardown } from './setup';
import { createDatabase } from '@/db';
import { payments } from '@/db/schema';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { eq } from 'drizzle-orm';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = createDatabase('file:test.db');

describe('Payments Integration Tests', () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: join(__dirname, '../src/db/migrations') });
    await db.delete(payments);
  });

  beforeEach(async () => {
    await db.delete(payments);
    
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ 
          success: true, 
          executionId: 'exec_123',
          intentId: 'intent_456',
          depositAddress: 'deposit_789',
          status: 'success'
        }),
      } as Response)
    );
  });

  afterAll(async () => {
    await teardown();
  });

  describe('prepare', () => {
    it('creates a new payment record when none exists', async () => {
      const client = await getPluginClient({ nearAccountId: 'test-merchant.near' });
      
      const result = await client.payments.prepare({
        request: {
          payer: {
            address: 'payer.near',
          },
          recipient: {
            address: 'merchant.near',
          },
          asset: {
            assetId: 'usdc.near',
            amount: '1000000',
          },
          memo: 'demo payment',
          idempotencyKey: 'idem-123',
        },
      });

      expect(result.payment.paymentId).toMatch(/^pay_/);
      expect(result.payment.status).toBe('PENDING');
      expect(result.payment.request.asset).toEqual({
        assetId: 'usdc.near',
        amount: '1000000',
      });
      expect(result.payment.request.payer).toEqual({
        address: 'payer.near',
      });
      expect(result.payment.request.recipient).toEqual({
        address: 'merchant.near',
      });
      expect(result.payment.request.idempotencyKey).toBe('idem-123');
      expect(result.payment.createdAt).toBeDefined();
      expect(result.payment.updatedAt).toBeDefined();

      const allPayments = await db.select().from(payments);
      expect(allPayments).toHaveLength(1);
    });

    it('returns existing payment for same merchant + idempotency key', async () => {
      const client = await getPluginClient({ nearAccountId: 'test-merchant.near' });
      
      const request = {
        payer: {
          address: 'payer.near',
        },
        recipient: {
          address: 'merchant.near',
        },
        asset: {
          assetId: 'usdc.near',
          amount: '1000000',
        },
        memo: 'reuse test',
        idempotencyKey: 'reuse-1',
      };

      const first = await client.payments.prepare({ request });
      const second = await client.payments.prepare({ request });

      expect(second.payment.paymentId).toBe(first.payment.paymentId);
      expect(second.payment.createdAt).toBe(first.payment.createdAt);

      const allPayments = await db.select().from(payments);
      expect(allPayments).toHaveLength(1);
    });
  });

  describe('get', () => {
    it('fetches payment by id scoped to merchant', async () => {
      const client = await getPluginClient({ nearAccountId: 'test-merchant.near' });
      
      const prepareResult = await client.payments.prepare({
        request: {
          payer: {
            address: 'payer.near',
          },
          recipient: {
            address: 'merchant.near',
          },
          asset: {
            assetId: 'usdc.near',
            amount: '1000000',
          },
          memo: 'fetch test',
          idempotencyKey: 'fetch-1',
        },
      });

      const result = await client.payments.get({
        paymentId: prepareResult.payment.paymentId,
      });

      expect(result.payment.paymentId).toBe(prepareResult.payment.paymentId);
      expect(result.payment.status).toBe('PENDING');
    });

    it('throws error when merchant does not own payment', async () => {
      const client1 = await getPluginClient({ nearAccountId: 'merchant-1.near' });
      
      const prepareResult = await client1.payments.prepare({
        request: {
          payer: {
            address: 'payer.near',
          },
          recipient: {
            address: 'merchant.near',
          },
          asset: {
            assetId: 'usdc.near',
            amount: '1000000',
          },
          memo: 'fetch test',
          idempotencyKey: 'fetch-2',
        },
      });

      const client2 = await getPluginClient({ nearAccountId: 'merchant-2.near' });

      await expect(
        client2.payments.get({
          paymentId: prepareResult.payment.paymentId,
        })
      ).rejects.toThrow();
    });

    it('throws error for missing payment', async () => {
      const client = await getPluginClient({ nearAccountId: 'test-merchant.near' });
      
      await expect(
        client.payments.get({
          paymentId: 'pay_nonexistent',
        })
      ).rejects.toThrow();
    });
  });

  describe('submit', () => {
    it('submits payment successfully', async () => {
      const client = await getPluginClient({ nearAccountId: 'test-merchant.near' });
      
      const prepareResult = await client.payments.prepare({
        request: {
          payer: {
            address: 'payer.near',
          },
          recipient: {
            address: 'merchant.near',
          },
          asset: {
            assetId: 'usdc.near',
            amount: '1000000',
          },
          memo: 'submit test',
          idempotencyKey: 'submit-1',
        },
      });

      const result = await client.payments.submit({
        paymentId: prepareResult.payment.paymentId,
        signedPayload: { proof: 'demo' },
        idempotencyKey: 'submit-idem-1',
      });

      expect(result.payment.paymentId).toBe(prepareResult.payment.paymentId);
      expect(result.payment.status).toBe('SUCCESS');
    });

    it('throws error for missing payment', async () => {
      const client = await getPluginClient({ nearAccountId: 'test-merchant.near' });
      
      await expect(
        client.payments.submit({
          paymentId: 'pay_missing',
          signedPayload: {},
          idempotencyKey: 'submit-idem-2',
        })
      ).rejects.toThrow();
    });

    it('throws error when payment already finalized', async () => {
      const client = await getPluginClient({ nearAccountId: 'test-merchant.near' });
      
      const prepareResult = await client.payments.prepare({
        request: {
          payer: {
            address: 'payer.near',
          },
          recipient: {
            address: 'merchant.near',
          },
          asset: {
            assetId: 'usdc.near',
            amount: '1000000',
          },
          memo: 'finalized test',
          idempotencyKey: 'finalized-1',
        },
      });

      await client.payments.submit({
        paymentId: prepareResult.payment.paymentId,
        signedPayload: { proof: 'first' },
        idempotencyKey: 'submit-idem-3',
      });

      await expect(
        client.payments.submit({
          paymentId: prepareResult.payment.paymentId,
          signedPayload: { proof: 'second' },
          idempotencyKey: 'submit-idem-4',
        })
      ).rejects.toThrow();
    });

    it('stores settlement refs from execution response', async () => {
      const client = await getPluginClient({ nearAccountId: 'test-merchant.near' });
      
      const prepareResult = await client.payments.prepare({
        request: {
          payer: {
            address: 'payer.near',
          },
          recipient: {
            address: 'merchant.near',
          },
          asset: {
            assetId: 'usdc.near',
            amount: '1000000',
          },
          memo: 'settlement test',
          idempotencyKey: 'settlement-1',
        },
      });

      await client.payments.submit({
        paymentId: prepareResult.payment.paymentId,
        signedPayload: { proof: 'demo' },
        idempotencyKey: 'submit-idem-5',
      });

      const dbResult = await db.select().from(payments).where(eq(payments.id, prepareResult.payment.paymentId));
      expect(dbResult).toHaveLength(1);
      expect(dbResult[0]?.settlementRefs).toBeDefined();
      
      const settlementRefs = JSON.parse(dbResult[0]?.settlementRefs || '{}');
      expect(settlementRefs.intentId).toBe('intent_456');
      expect(settlementRefs.depositAddress).toBe('deposit_789');
      expect(settlementRefs.executionId).toBe('exec_123');
    });

    it('handles provider auth errors', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ message: 'Unauthorized' }),
        } as Response)
      );

      const client = await getPluginClient({ nearAccountId: 'test-merchant.near' });
      
      const prepareResult = await client.payments.prepare({
        request: {
          payer: {
            address: 'payer.near',
          },
          recipient: {
            address: 'merchant.near',
          },
          asset: {
            assetId: 'usdc.near',
            amount: '1000000',
          },
          idempotencyKey: 'auth-error-1',
        },
      });

      await expect(
        client.payments.submit({
          paymentId: prepareResult.payment.paymentId,
          signedPayload: { proof: 'demo' },
          idempotencyKey: 'submit-auth-1',
        })
      ).rejects.toThrow();
    });

    it('handles provider rate limit errors', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 429,
          json: () => Promise.resolve({ message: 'Too many requests' }),
        } as Response)
      );

      const client = await getPluginClient({ nearAccountId: 'test-merchant.near' });
      
      const prepareResult = await client.payments.prepare({
        request: {
          payer: {
            address: 'payer.near',
          },
          recipient: {
            address: 'merchant.near',
          },
          asset: {
            assetId: 'usdc.near',
            amount: '1000000',
          },
          idempotencyKey: 'rate-limit-1',
        },
      });

      await expect(
        client.payments.submit({
          paymentId: prepareResult.payment.paymentId,
          signedPayload: { proof: 'demo' },
          idempotencyKey: 'submit-rate-1',
        })
      ).rejects.toThrow();
    });

    it('handles provider validation errors', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ message: 'amount must be a number string' }),
        } as Response)
      );

      const client = await getPluginClient({ nearAccountId: 'test-merchant.near' });
      
      const prepareResult = await client.payments.prepare({
        request: {
          payer: {
            address: 'payer.near',
          },
          recipient: {
            address: 'merchant.near',
          },
          asset: {
            assetId: 'usdc.near',
            amount: '1000000',
          },
          idempotencyKey: 'validation-1',
        },
      });

      await expect(
        client.payments.submit({
          paymentId: prepareResult.payment.paymentId,
          signedPayload: { proof: 'demo' },
          idempotencyKey: 'submit-validation-1',
        })
      ).rejects.toThrow();
    });

    it('marks payment as PENDING when execution returns pending status', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ 
            executionId: 'exec_pending',
            status: 'pending',
            depositAddress: 'deposit_pending'
          }),
        } as Response)
      );

      const client = await getPluginClient({ nearAccountId: 'test-merchant.near' });
      
      const prepareResult = await client.payments.prepare({
        request: {
          payer: {
            address: 'payer.near',
          },
          recipient: {
            address: 'merchant.near',
          },
          asset: {
            assetId: 'usdc.near',
            amount: '1000000',
          },
          idempotencyKey: 'pending-1',
        },
      });

      const result = await client.payments.submit({
        paymentId: prepareResult.payment.paymentId,
        signedPayload: { proof: 'demo' },
        idempotencyKey: 'submit-pending-1',
      });

      expect(result.payment.status).toBe('PENDING');
    });
  });
});
