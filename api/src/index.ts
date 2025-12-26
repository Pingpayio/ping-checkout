import { createPlugin } from 'every-plugin';
import { Effect } from 'every-plugin/effect';
import { ORPCError } from 'every-plugin/orpc';
import { z } from 'every-plugin/zod';
import { contract } from './contract';
import { Database, DatabaseLive } from './store';
import { eq } from 'drizzle-orm';
import { CheckoutService, CheckoutSessionNotFoundError } from './services/checkout';
import { PaymentsService, PaymentNotFoundError, PaymentAlreadyFinalizedError } from './services/payments';
import { createDatabase } from './db';

export default createPlugin({
  variables: z.object({
  }),

  secrets: z.object({
    DATABASE_URL: z.string().default('file:./api.db'),
    DATABASE_AUTH_TOKEN: z.string().optional(),
    NEAR_INTENTS_API_KEY: z.string().optional(),
  }),

  context: z.object({
    nearAccountId: z.string().optional(),
  }),

  contract,

  initialize: (config) =>
    Effect.gen(function* () {
      const dbLayer = DatabaseLive(config.secrets.DATABASE_URL, config.secrets.DATABASE_AUTH_TOKEN);
      const db = yield* Effect.provide(Database, dbLayer);

      const checkoutService = new CheckoutService(db);
      const paymentsService = new PaymentsService(db, config.secrets.NEAR_INTENTS_API_KEY);

      console.log('[API] Plugin initialized');

      return { db, checkoutService, paymentsService };
    }),

  shutdown: (context) =>
    Effect.gen(function* () {
      console.log('[API] Plugin shutting down');
    }),

  createRouter: (context, builder) => {
    const { checkoutService, paymentsService } = context;

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
        prepare: builder.payments.prepare.handler(async ({ input, context }) => {
          const merchantId = context.nearAccountId || 'anonymous';
          
          try {
            const result = await Effect.runPromise(
              paymentsService.preparePaymentFromSession(
                merchantId,
                input.input,
                checkoutService
              )
            );
            return result;
          } catch (error) {
            throw new ORPCError('INTERNAL_SERVER_ERROR', {
              message: error instanceof Error ? error.message : 'Failed to prepare payment',
            });
          }
        }),

        submit: builder.payments.submit.handler(async ({ input, context }) => {
          const merchantId = context.nearAccountId || 'anonymous';
          
          try {
            const result = await Effect.runPromise(
              paymentsService.submitPayment(merchantId, input)
            );
            return result;
          } catch (error) {
            if (error instanceof PaymentNotFoundError) {
              throw new ORPCError('NOT_FOUND', {
                message: error.message,
              });
            }
            if (error instanceof PaymentAlreadyFinalizedError) {
              throw new ORPCError('CONFLICT', {
                message: error.message,
              });
            }
            throw new ORPCError('INTERNAL_SERVER_ERROR', {
              message: error instanceof Error ? error.message : 'Failed to submit payment',
            });
          }
        }),

        get: builder.payments.get.handler(async ({ input, context }) => {
          const merchantId = context.nearAccountId || 'anonymous';
          
          try {
            const result = await Effect.runPromise(
              paymentsService.getPayment(merchantId, input)
            );
            return result;
          } catch (error) {
            if (error instanceof PaymentNotFoundError) {
              throw new ORPCError('NOT_FOUND', {
                message: error.message,
              });
            }
            throw new ORPCError('INTERNAL_SERVER_ERROR', {
              message: error instanceof Error ? error.message : 'Failed to get payment',
            });
          }
        }),

        getStatus: builder.payments.getStatus.handler(async ({ input, context }) => {
          try {
            const result = await Effect.runPromise(
              paymentsService.getPaymentStatus(input.depositAddress)
            );
            return result;
          } catch (error) {
            throw new ORPCError('INTERNAL_SERVER_ERROR', {
              message: error instanceof Error ? error.message : 'Failed to get payment status',
            });
          }
        }),

        getQuote: builder.payments.getQuote.handler(async ({ input, context }) => {
          const merchantId = context.nearAccountId || 'anonymous';
          
          try {
            const result = await Effect.runPromise(
              paymentsService.getQuote(merchantId, input.input, checkoutService)
            );
            return result;
          } catch (error) {
            if (error instanceof CheckoutSessionNotFoundError) {
              throw new ORPCError('NOT_FOUND', {
                message: error.message,
              });
            }
            throw new ORPCError('INTERNAL_SERVER_ERROR', {
              message: error instanceof Error ? error.message : 'Failed to get quote',
            });
          }
        }),
      },
    }
  },
});
