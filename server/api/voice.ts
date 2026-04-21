import { Router } from 'express';
import type { Response, Request } from "express";
import { getRegions } from '../helpers/globalutils.js';

const router = Router({ mergeParams: true });

router.get('/regions', async (_req: Request, res: Response) => {
  return res.status(200).json(getRegions());
});

export default router;
