import { Router } from 'express';
const router = Router();
import Snowflake from '../../../helpers/snowflake.ts';
import type { Request, Response } from "express";
import { prisma } from '../../../prisma.ts';
import type { GuildSubscription } from '../../../types/guild.ts';

router.get('/subscriptions', async (req: Request, res: Response) => {
  const account = req.account;
  const subscriptions = await prisma.guildSubscription.findMany({
      where: { user_id: account.id },
      select: {
        guild_id: true,
        user_id: true,
        subscription_id: true,
        ended: true,
      }
  });

  return res.status(200).json(subscriptions.map(sub => ({
      guild_id: sub.guild_id,
      user_id: sub.user_id,
      id: sub.subscription_id,
      ended: sub.ended,
    } as GuildSubscription)));
});

router.get('/payment-sources', (_req: Request, res: Response) => {
  return res.status(200).json([
    {
      id: Snowflake.generate(),
      type: 1,
      invalid: false,
      flags: 0,
      brand: 'visa',
      last_4: '5555',
      expires_month: 12,
      expires_year: 2099,
      country: 'US',
      billing_address: {
        name: 'Johnathon Oldcord',
        line_1: '123 Oldcord Way',
        line_2: null,
        town: 'San Francisco',
        state: 'CA',
        postal_code: '94105',
        country: 'US',
      },
      default: true,
    },
  ]);
});

export default router;
