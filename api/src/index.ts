import { createPlugin } from 'every-plugin';
import { Effect } from 'every-plugin/effect';
import { ORPCError } from 'every-plugin/orpc';
import { z } from 'every-plugin/zod';
import { contract } from './contract';
import { Database, DatabaseLive } from './store';
import { eq } from 'drizzle-orm';
import { CheckoutService, CheckoutSessionNotFoundError } from './services/checkout';
import { createDatabase } from './db';

export default createPlugin({
  variables: z.object({
  }),

  secrets: z.object({
    DATABASE_URL: z.string().default('file:./api.db'),
    DATABASE_AUTH_TOKEN: z.string().optional(),
  }),

  context: z.object({
    nearAccountId: z.string().optional(),
  }),

  contract,

  initialize: (config) =>
    Effect.gen(function* () {
      const dbLayer = DatabaseLive(config.secrets.DATABASE_URL, config.secrets.DATABASE_AUTH_TOKEN);
      const db = yield* Effect.provide(Database, dbLayer);

      console.log('[API] Plugin initialized');

      return { db };
    }),

  shutdown: (context) =>
    Effect.gen(function* () {
      console.log('[API] Plugin shutting down');
    }),

  createRouter: (context, builder) => {
    const { db } = context;
    const checkoutService = new CheckoutService(db);

    const requireAuth = builder.middleware(async ({ context, next }) => {
      if (!context.nearAccountId) {
        throw new ORPCError('UNAUTHORIZED', {
          message: 'Authentication required',
          data: { authType: 'nearAccountId' }
        });
      }
      return next({
        context: {
          nearAccountId: context.nearAccountId,
        }
      });
    });

    return {
      ping: builder.ping.handler(async () => {
        return {
          status: 'ok' as const,
          timestamp: new Date().toISOString(),
        };
      }),

      checkout: {
        createSession: builder.checkout.createSession.handler(async ({ input, context }) => {
          const merchantId = context.nearAccountId || 'anonymous';
          
          try {
            const result = await Effect.runPromise(
              checkoutService.createSession(merchantId, input)
            );
            return result;
          } catch (error) {
            throw new ORPCError('INTERNAL_SERVER_ERROR', {
              message: error instanceof Error ? error.message : 'Failed to create session',
            });
          }
        }),

        getSession: builder.checkout.getSession.handler(async ({ input, context }) => {
          const merchantId = context.nearAccountId || 'anonymous';
          
          try {
            const result = await Effect.runPromise(
              checkoutService.getSession(merchantId, input)
            );
            return result;
          } catch (error) {
            if (error instanceof CheckoutSessionNotFoundError) {
              throw new ORPCError('NOT_FOUND', {
                message: error.message,
              });
            }
            throw new ORPCError('INTERNAL_SERVER_ERROR', {
              message: error instanceof Error ? error.message : 'Failed to fetch session',
            });
          }
        }),
      },

      payments: {
        prepare: builder.payments.prepare.handler(async ({ input }) => {
          throw new ORPCError('NOT_IMPLEMENTED', {
            message: 'Payment preparation not yet implemented',
          });
        }),

        submit: builder.payments.submit.handler(async ({ input }) => {
          throw new ORPCError('NOT_IMPLEMENTED', {
            message: 'Payment submission not yet implemented',
          });
        }),

        get: builder.payments.get.handler(async ({ input }) => {
          throw new ORPCError('NOT_IMPLEMENTED', {
            message: 'Payment retrieval not yet implemented',
          });
        }),
      },
    }
  },
});
