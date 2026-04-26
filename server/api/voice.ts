import { Router } from 'express';
import type { Response, Request } from "express";
import { getRegions } from '../helpers/globalutils.js';
import { cacheForMiddleware } from '../helpers/middlewares.ts';

const router = Router({ mergeParams: true });

router.get('/regions', cacheForMiddleware(60 * 60 * 5, "private", false), async (_req: Request, res: Response) => {
  return res.status(200).json(getRegions());
});

export default router;