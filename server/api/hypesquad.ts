//https://staging.oldcordapp.com/api/v6/hypesquad/online

import { Router } from 'express';

import errors from '../helpers/errors.ts';
import { logText } from '../helpers/logger.ts';
import { rateLimitMiddleware } from '../helpers/middlewares.ts';
import type { Response, Request } from "express";
import { prisma } from '../prisma.ts';
import ctx from '../context.ts';

const router = Router({ mergeParams: true });
const HOUSE_FLAGS: Record<number, number> = {
  1: 64,  // Bravery
  2: 128, // Brilliance
  3: 256  // Balance
};

const THE_TRUE_ONE = 4;

const updateAccountFlags = async (accountId: string, newFlags: number) => {
  return await prisma.user.update({
    where: { id: accountId },
    data: { flags: newFlags }
  });
};

router.post('/online', rateLimitMiddleware(
    ctx.config!.ratelimit_config.hypesquadHouseChange.maxPerTimeFrame,
    ctx.config!.ratelimit_config.hypesquadHouseChange.timeFrame,
  ), async (req: Request, res: Response) => {
  try {
    const { house_id } = req.body;
    const targetFlag = HOUSE_FLAGS[house_id];

    if (!targetFlag) {
      return res.status(400).json({
        code: 400,
        message: "Invalid house ID (Expected: 1, 2, 3)"
      });
    }

    let flags = Number(req.account.flags || 0);

    const ALL_HOUSES_MASK = HOUSE_FLAGS[1] | HOUSE_FLAGS[2] | HOUSE_FLAGS[3];

    flags &= ~ALL_HOUSES_MASK;
    flags |= targetFlag;

    await updateAccountFlags(req.account.id, flags);

    return res.status(204).send();
  } catch (error) {
    logText(error, 'error');

    return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
  }
});

router.post('/the-true-one', rateLimitMiddleware(
    ctx.config!.ratelimit_config.hypesquadHouseChange.maxPerTimeFrame,
    ctx.config!.ratelimit_config.hypesquadHouseChange.timeFrame,
  ), async (req: Request, res: Response) => {
  try {
    const flags = Number(req.account.flags || 0) ^ THE_TRUE_ONE;

    await updateAccountFlags(req.account.id, flags);

    return res.status(204).send();
  } catch (error) {
    logText(error, 'error');

    return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
  }
});

export default router;
