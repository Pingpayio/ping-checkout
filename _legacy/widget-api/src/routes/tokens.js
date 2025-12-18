import { Router } from 'express';
import axios from 'axios';

const router = Router();
const BASE = (process.env.TOKENS_FEED_BASE || 'https://1click.chaindefuser.com').replace(/\/$/, '');
const PATH = process.env.TOKENS_FEED_PATH || '/v0/tokens';

router.get('/v0/tokens', async (_req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const { data } = await axios.get(`${BASE}${PATH}`, { timeout: 10000 });
    return res.json(data);
  } catch (err) {
    return res.status(err?.response?.status || 502).json({
      success: false,
      error: 'TOKENS_FEED_ERROR',
      message: err?.response?.data?.message || err?.message || 'Failed to fetch tokens',
    });
  }
});

export default router;
