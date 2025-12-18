import type { NextFunction, Response } from 'express';
import { sendError } from '../utils/errorResponse.js';
import { redisStore } from '../utils/redis.js';
import type { RequestWithAuth } from '../types.js';

type Cached = { statusCode: number; body: unknown };

const CACHE_TTL_SECONDS = 86_400;

function cacheKey(key: string): string {
  return `idemp:${key}`;
}

async function persist(key: string, res: Response, body: unknown) {
  const payload: Cached = { statusCode: res.statusCode, body };
  await redisStore.setex(cacheKey(key), CACHE_TTL_SECONDS, JSON.stringify(payload));
}

export function idempotency() {
  return async (req: RequestWithAuth, res: Response, next: NextFunction) => {
    if (req.method !== 'POST') return next();
    const key = typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'] : null;
    if (!key) return sendError(res, 400, 'MISSING_IDEMPOTENCY_KEY', 'Idempotency-Key required');

    const cached = await redisStore.get(cacheKey(key));
    if (cached) {
      const parsed = JSON.parse(cached) as Cached;
      res.status(parsed.statusCode).json(parsed.body);
      return;
    }

    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      void persist(key, res, body);
      return originalJson(body);
    }) as typeof res.json;

    return next();
  };
}

