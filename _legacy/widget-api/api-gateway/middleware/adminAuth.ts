import type { NextFunction, Response } from 'express';
import { sendError } from '../utils/errorResponse.js';
import type { RequestWithAdmin } from '../types.js';

export function adminAuth() {
  return (req: RequestWithAdmin, res: Response, next: NextFunction) => {
    const adminKey = typeof req.headers['x-admin-api-key'] === 'string' 
      ? req.headers['x-admin-api-key'] 
      : null;
    
    if (!adminKey) {
      return sendError(res, 401, 'UNAUTHORIZED', 'Admin API key is invalid or missing');
    }

    const expectedKey = process.env.ADMIN_API_KEY;
    if (!expectedKey) {
      return sendError(res, 500, 'SERVER_ERROR', 'Admin API key not configured');
    }

    if (adminKey !== expectedKey) {
      return sendError(res, 401, 'UNAUTHORIZED', 'Admin API key is invalid or missing');
    }

    req.admin = { isAdmin: true };
    return next();
  };
}

