import type { NextFunction, Response } from 'express';
import { apiKeyStore } from '../utils/db.js';
import { sendError } from '../utils/errorResponse.js';
import type { RequestWithAuth } from '../types.js';

export function apiKeyAuth(requiredScopes: string[]) {
  return async (req: RequestWithAuth, res: Response, next: NextFunction) => {
    // ✅ TEMPORARY DEMO BYPASS:
    // Allow checkout (public widget) endpoints without x-ping-api-key.
    // Paths inside the gateway will look like "/checkout/sessions", "/checkout/sessions/:id".
    if (req.path.startsWith('/checkout')) {
      return next();
    }

    const key = typeof req.headers['x-ping-api-key'] === 'string' ? req.headers['x-ping-api-key'] : null;
    if (!key) return sendError(res, 401, 'UNAUTHENTICATED', 'Missing API key');

    const record = await apiKeyStore.findActiveByKey(key);
    if (!record || record.revokedAt) return sendError(res, 401, 'INVALID_API_KEY', 'API key invalid or revoked');

    const allowed = requiredScopes.every(scope => record.scopes.includes(scope));
    if (!allowed) return sendError(res, 403, 'FORBIDDEN', 'Insufficient permissions');

    req.auth = {
      merchantId: record.merchantId,
      scopes: record.scopes,
      keyType: record.type,
      apiKeyId: record.id,
      secret: record.type === 'secret' ? record.secret : undefined
    };

    return next();
  };
}

