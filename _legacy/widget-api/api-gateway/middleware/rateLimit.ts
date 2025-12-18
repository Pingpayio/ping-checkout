import type { NextFunction, Response } from 'express';
import { sendError } from '../utils/errorResponse.js';
import { redisStore } from '../utils/redis.js';
import type { RequestWithAuth } from '../types.js';

interface WindowConfig {
  window: number;
  limit: number;
  prefix: string;
}

const WINDOWS: WindowConfig[] = [
  { window: 60, limit: 300, prefix: 'rl:60' },
  { window: 300, limit: 3000, prefix: 'rl:300' }
];

async function bump(key: string, cfg: WindowConfig): Promise<number> {
  const shard = `${cfg.prefix}:${key}`;
  const count = await redisStore.incr(shard);
  const ttl = await redisStore.pttl(shard);
  if (ttl < 0) await redisStore.expire(shard, cfg.window);
  return count;
}

function overLimit(count: number, cfg: WindowConfig): boolean {
  return count > cfg.limit;
}

export function rateLimit() {
  return async (req: RequestWithAuth, res: Response, next: NextFunction) => {
    const apiKeyId = req.auth?.apiKeyId;
    const headerKey =
      typeof req.headers['x-ping-api-key'] === 'string'
        ? req.headers['x-ping-api-key']
        : null;
    const identifier = apiKeyId || headerKey || req.ip || 'unknown';

    for (const cfg of WINDOWS) {
      const count = await bump(identifier, cfg);
      if (overLimit(count, cfg)) {
        return sendError(res, 429, 'RATE_LIMITED', 'Too many requests');
      }
    }

    return next();
  };
}

export function publicRateLimit() {
  return async (req: RequestWithAuth, res: Response, next: NextFunction) => {
    // For public routes, use IP address or publishable key for rate limiting
    const identifier = 
      req.query.publishableKey as string || 
      req.ip || 
      req.headers['x-forwarded-for'] as string || 
      'unknown';
    
    const key = `public:${identifier}`;

    for (const cfg of WINDOWS) {
      const count = await bump(key, cfg);
      if (overLimit(count, cfg)) {
        return sendError(res, 429, 'RATE_LIMITED', 'Too many requests');
      }
    }

    return next();
  };
}



