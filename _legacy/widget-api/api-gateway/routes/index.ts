import { Router, type Request, type Response } from 'express';
import { apiKeyAuth } from '../middleware/apiKeyAuth.js';
import { hmacVerify } from '../middleware/hmacVerify.js';
import { idempotency } from '../middleware/idempotency.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { sendError } from '../utils/errorResponse.js';
import checkoutRouter from './checkout.js';
import paymentsRouter from './payments.js';
import quotesRouter from './quotes.js';
import webhooksRouter from './webhooks.js';
import pingLinksRouter from './pingLinks.js';
import widgetRouter from './widget.js';
import transactionsRouter from './transactions.js';
import apiKeysRouter from './apiKeys.js';
import adminRouter from './admin.js';
import openapiRouter from './openapi.js';

type RouteDef = { method: 'get' | 'post' | 'delete'; path: string; scopes: string[]; idempotent?: boolean };

const postRoutes: RouteDef[] = [
  // checkout/sessions handled by checkoutRouter
  // { method: 'post', path: '/checkout/sessions', scopes: ['sessions:write'], idempotent: true },
  { method: 'post', path: '/payments/submit', scopes: ['payments:write'], idempotent: true },
  // ping-links handled by pingLinksRouter
  // { method: 'post', path: '/ping-links', scopes: ['ping-links:write'], idempotent: true },
  { method: 'post', path: '/quotes', scopes: ['quotes:write'], idempotent: true },
  // webhooks handled by webhooksRouter
  // { method: 'post', path: '/webhooks', scopes: ['webhooks:write'], idempotent: true },
  // { method: 'post', path: '/webhooks/test', scopes: ['webhooks:write'], idempotent: true },
  { method: 'post', path: '/onramp/sessions', scopes: ['onramp:write'], idempotent: true },
  { method: 'post', path: '/x402/fulfill', scopes: ['x402:write'], idempotent: true }
];

const getRoutes: RouteDef[] = [
  // checkout/sessions/:id handled by checkoutRouter
  // { method: 'get', path: '/checkout/sessions/:id', scopes: ['sessions:read'] },
  { method: 'get', path: '/payments/:paymentId', scopes: ['payments:read'] },
  // ping-links handled by pingLinksRouter
  // { method: 'get', path: '/ping-links/:pingLinkId', scopes: ['ping-links:read'] },
];

const deleteRoutes: RouteDef[] = [
  // webhooks handled by webhooksRouter
  // { method: 'delete', path: '/webhooks/:id', scopes: ['webhooks:write'] }
];

function notImplemented(_: Request, res: Response) {
  return sendError(res, 501, 'NOT_IMPLEMENTED', 'Coming soon');
}

export function createApiGatewayRouter() {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', ts: new Date().toISOString() });
  });

  router.post(
    '/echo',
    apiKeyAuth(['diagnostics:write']),
    hmacVerify(),
    idempotency(),
    rateLimit(),
    (req, res) => {
      res.status(200).json({ echo: req.body ?? null });
    }
  );

  // Mount routed groups
  router.use(checkoutRouter);
  router.use(paymentsRouter);
  router.use(quotesRouter);
  router.use(webhooksRouter);
  router.use(pingLinksRouter);
  router.use(widgetRouter);
  router.use(transactionsRouter);
  router.use(apiKeysRouter);
  router.use(adminRouter);
  router.use(openapiRouter);

  const applyRoute = (def: RouteDef) => {
    const middleware: any[] = [apiKeyAuth(def.scopes)];
    if (def.method !== 'get') middleware.push(hmacVerify());
    if (def.idempotent) middleware.push(idempotency());
    middleware.push(rateLimit());
    (router as any)[def.method](def.path, ...middleware, notImplemented as any);
  };

  [...postRoutes, ...getRoutes, ...deleteRoutes].forEach(applyRoute);

  return router;
}

