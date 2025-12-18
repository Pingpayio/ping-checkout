import crypto from 'crypto';
import type { NextFunction, Response } from 'express';
import { sendError } from '../utils/errorResponse.js';
import type { RequestWithAuth } from '../types.js';

function safeEqual(a: string, b: string): boolean {
  const buffA = Buffer.from(a, 'hex');
  const buffB = Buffer.from(b, 'hex');
  if (buffA.length !== buffB.length) return false;
  return crypto.timingSafeEqual(buffA, buffB);
}

export function hmacVerify() {
  return (req: RequestWithAuth, res: Response, next: NextFunction) => {
    if (req.auth?.keyType !== 'secret') return next();
    const signature = typeof req.headers['x-ping-signature'] === 'string' ? req.headers['x-ping-signature'] : null;
    const nonce = typeof req.headers['x-ping-nonce'] === 'string' ? req.headers['x-ping-nonce'] : null;
    if (!signature || !nonce) return sendError(res, 401, 'MISSING_SIGNATURE', 'Missing HMAC signature');
    if (!req.auth?.secret) return sendError(res, 500, 'SERVER_ERROR', 'Secret key missing');

    const body = JSON.stringify(req.body ?? '');
    const path = req.originalUrl ?? req.path;
    const raw = `${nonce}${req.method}${path}${body}`;
    const expected = crypto.createHmac('sha256', req.auth.secret).update(raw).digest('hex');
    if (!safeEqual(expected, signature)) return sendError(res, 401, 'INVALID_SIGNATURE', 'HMAC verification failed');
    return next();
  };
}



