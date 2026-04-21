import express from 'express';

import { authMiddleware, instanceMiddleware } from '../helpers/middlewares.ts';
const app = express();
import { config, generateGatewayURL } from '../helpers/globalutils.ts';
import activities from './activities.ts';
import admin from './admin.ts';
import auth from './auth.ts';
import channels from './channels.ts';
import connections from './connections.ts';
import entitlements from './entitlements.ts';
import gifs from './gifs.ts';
import guilds from './guilds.js';
import integrations from './integrations.ts';
import invites from './invites.js';
import oauth2 from './oauth2/index.ts';
import reports from './reports.ts';
import spacebarPing from "./spacebar-compat/ping.ts";
import spacebarPolicies from './spacebar-compat/policies.ts';
import store from './store.ts';
import tutorial from './tutorial.ts';
import users from './users/index.ts';
import voice from './voice.ts';
import webhooks from './webhooks.js';
import type { NextFunction, Request, Response } from "express";
import { GuildService } from './services/guildService.ts';
import { AccountService } from './services/accountService.ts';
import { ChannelService } from './services/channelService.ts';
import { MessageService } from './services/messageService.ts';
import { OAuthService } from './services/oauthService.ts';
import { WebhookService } from './services/webhookService.ts';
import { InviteService } from './services/inviteService.ts';
import type { Account } from '../types/account.ts';
import { ChannelType } from '../types/channel.ts';

ctx.config = config;
//just in case

app.use('/auth', auth);
app.use('/connections', instanceMiddleware('VERIFIED_EMAIL_REQUIRED'), connections);

app.get('/incidents/unresolved.json', (_req: Request, res: Response) => {
  return res.status(200).json({
    scheduled_maintenances: [],
    incidents: [],
  });
});

app.get('/scheduled-maintenances/upcoming.json', (_req: Request, res: Response) => {
  return res.status(200).json({
    scheduled_maintenances: [],
  });
});

app.get('/scheduled-maintenances/active.json', (_req: Request, res: Response) => {
  return res.status(200).json({
    scheduled_maintenances: [],
    incidents: [],
  });
});

app.use('/policies', spacebarPolicies);

app.use('/ping', spacebarPing);

app.get('/experiments', (_req: Request, res: Response) => {
  return res.status(200).json({ assignments: [] });
});

app.get('/promotions', (_req: Request, res: Response) => {
  return res.status(200).json([]);
});

app.get('/applications', (_req: Request, res: Response) => {
  return res.status(200).json([]);
});

app.get('/activities', (_req: Request, res: Response) => {
  return res.status(200).json([]);
});

app.get('/applications/detectable', (_req: Request, res: Response) => {
  return res.status(200).json([]);
});

app.get('/games', (_req: Request, res: Response) => {
  return res.status(200).json([]);
});

app.get('/gateway', (req: Request, res: Response) => {
  return res.status(200).json({
    url: generateGatewayURL(req),
  });
});

app.get('/gateway/bot', (req: Request, res: Response) => {
  return res.status(200).json({
    url: generateGatewayURL(req),
    shards: 0,
    session_start_limit: {
      total: 1,
      remaining: 1,
      reset_after: 14400000,
      max_concurrency: 1,
    },
  });
});

app.get('/voice/ice', (_req: Request, res: Response) => {
  return res.status(200).json({
    servers: [
      {
        url: 'stun:stun.l.google.com:19302',
        username: '',
        credential: '',
      },
    ],
  });
});

app.use('/reports', reports);

app.use(authMiddleware);

app.param('userid', async (req: Request, _res: Response, next: NextFunction, userid: string) => {
  if (userid === '@me') {
     userid = req.account!!.id;
  }

  req.user = await AccountService.getById(userid) as Account;
  req.is_user_staff = req.user && (req.user.flags!! & (1 << 0)) === 1 << 0;

  if (req.user != null && req.is_user_staff)
    req.user_staff_details = req.user.staff;

  next();
});

app.param('guildid', async (req: Request, _res: Response, next: NextFunction, guildid: string) => {
  req.guild = await GuildService.getById(guildid);

  next();
});

app.param('roleid', async (req: Request, _res: Response, next: NextFunction, roleid: string) => {
  req.role = req.guild!!.roles!!.find((x) => x.id === roleid);

  next();
});

app.param('channelid', async (req: Request, _res: Response, next: NextFunction, channelid) => {
  const guild = req.guild!!;

  if (!guild) {
    req.channel = await ChannelService.getChannelById(channelid);

    return next();
  }

  req.member = guild.members?.find((y: any) => y.user_id === req.account!!.id);
  
  const channel = guild.channels?.find((y: any) => y.id === channelid);

  if (!channel) {
    req.channel = null;

    return next();
  }

  const typeInt = parseInt(channel.type as string);

  if (req.channel_types_are_ints) {
    channel.type = typeInt;
  } else {
    channel.type = typeInt === ChannelType.VOICE ? 'voice' : 'text';
  }

  req.channel = channel;
  next();
});

app.param('code', async (req: Request, _res: Response, next: NextFunction, _memberid: string) => {
  req.invite = await InviteService.getInviteByCode(req.params.code as string);

  if (!req.guild && req.invite && req.invite.channel!!.guild_id) {
    req.guild = await GuildService.getById(req.invite.channel!!.guild_id);
  }

  next();
});

app.param('messageid', async (req: Request, _res: Response, next: NextFunction, messageid: string) => {
  req.message = await MessageService.getMessageById(messageid);
  next();
});

app.param('memberid', async (req: Request, _res: Response, next, memberid: string) => {
  req.member = req.guild!!.members!!.find((x) => x.id === memberid);

  next();
});

app.param('subscriptionid', async (req: Request, _res: Response, next: NextFunction, subscriptionid: string) => {
  req.subscription = await GuildService.getSubscription(subscriptionid);

  next();
});

app.param('recipientid', async (req: Request, _res: Response, next: NextFunction, recipientid: string) => {
  req.recipient = await AccountService.getById(recipientid);

  next();
});

app.param('applicationid', async (req: Request, _res: Response, next: NextFunction, id: string) => {
  req.application = await OAuthService.getApplicationById(id);

  next();
});

app.param('webhookid', async (req: Request, _res, next: NextFunction, webhookid: string) => {
  req.webhook = await WebhookService.getWebhookById(webhookid);

  next();
});

app.use('/admin', instanceMiddleware('VERIFIED_EMAIL_REQUIRED'), admin);
app.use('/tutorial', instanceMiddleware('VERIFIED_EMAIL_REQUIRED'), tutorial);
app.use('/users', instanceMiddleware('VERIFIED_EMAIL_REQUIRED'), users);
app.use('/voice', instanceMiddleware('VERIFIED_EMAIL_REQUIRED'), voice);
app.use('/guilds', instanceMiddleware('VERIFIED_EMAIL_REQUIRED'), guilds);
app.use('/channels', channels);
app.use('/gifs', gifs);
app.use('/entitlements', instanceMiddleware('VERIFIED_EMAIL_REQUIRED'), entitlements);
app.use('/activities', instanceMiddleware('VERIFIED_EMAIL_REQUIRED'), activities);
app.use(['/invite', '/invites'], instanceMiddleware('VERIFIED_EMAIL_REQUIRED'), invites);
app.use('/webhooks', instanceMiddleware('VERIFIED_EMAIL_REQUIRED'), webhooks);
app.use('/oauth2', instanceMiddleware('VERIFIED_EMAIL_REQUIRED'), oauth2);
app.use('/store', instanceMiddleware('VERIFIED_EMAIL_REQUIRED'), store);
app.use('/integrations', instanceMiddleware('VERIFIED_EMAIL_REQUIRED'), integrations);

app.use('/track', (_req: Request, res: Response) => {
  return res.status(204).send();
});

app.use('/science', (_req: Request, res: Response) => {
  return res.status(204).send();
});

export default app;
