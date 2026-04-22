import { Router, type Request, type Response } from 'express';

import dispatcher from '../helpers/dispatcher.ts';
import errors from '../helpers/errors.ts';
import { logText } from '../helpers/logger.ts';
import { cacheForMiddleware, channelPermissionsMiddleware, rateLimitMiddleware } from '../helpers/middlewares.ts';
import { MessageService } from './services/messageService.ts';
import { ChannelType } from '../types/channel.ts';
import permissions from '../helpers/permissions.ts';
import { prisma } from '../prisma.ts';
import ctx from '../context.ts';
import { PUBLIC_USER_SELECT } from './services/accountService.ts';

const router = Router({ mergeParams: false });

router.delete(
  ['/:urlencoded/@me', '/:urlencoded/%40me'],
  rateLimitMiddleware(
    ctx.config!.ratelimit_config.removeReaction.maxPerTimeFrame,
    ctx.config!.ratelimit_config.removeReaction.timeFrame,
  ),
  async (req: Request, res: Response) => {
    try {
      const account = req.account;
      const channel = req.channel;
      const guild = req.guild;

      if (channel.type != ChannelType.DM && channel.type != ChannelType.GROUPDM && !guild) {
        return res.status(404).json(errors.response_404.UNKNOWN_CHANNEL);
      }

      const message = req.message;

      if (guild && guild.exclusions?.includes('reactions')) {
        return res.status(400).json({
          code: 400,
          message: 'Reactions are disabled in this server due to its maximum support',
        });
      }

      let encoded = req.params.urlencoded as string;
      let dispatch_name = decodeURIComponent(encoded);
      let id: string | null = null;

      if (encoded.includes(':')) {
        id = encoded.split(':')[1];
        encoded = encoded.split(':')[0];
        dispatch_name = encoded;
      }

      const tryUnReact = await MessageService.removeMessageReaction(
        message.id,
        account.id,
        id,
        dispatch_name,
      );

      if (!tryUnReact) {
        return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
      }

      const payload = {
        channel_id: channel.id,
        message_id: message.id,
        user_id: account.id,
        emoji: {
          id: id,
          name: dispatch_name,
        },
      };

      if (guild)
        await dispatcher.dispatchEventInChannel(
          req.guild.id,
          channel.id,
          'MESSAGE_REACTION_REMOVE',
          payload,
        );
      else
        await dispatcher.dispatchEventInPrivateChannel(channel.id, 'MESSAGE_REACTION_REMOVE', payload);

      return res.status(204).send();
    } catch (error) {
      logText(error, 'error');

      return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
    }
  },
);

router.delete(
  '/:urlencoded/:userid',
  channelPermissionsMiddleware('MANAGE_MESSAGES'),
  rateLimitMiddleware(
    ctx.config!.ratelimit_config.removeReaction.maxPerTimeFrame,
    ctx.config!.ratelimit_config.removeReaction.timeFrame,
  ),
  async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const channel = req.channel;
      const guild = req.guild;

      if (channel.type != ChannelType.DM && channel.type != ChannelType.GROUPDM && !guild) {
        return res.status(404).json(errors.response_404.UNKNOWN_CHANNEL);
      }

      const message = req.message;

      if (guild && guild.exclusions?.includes('reactions')) {
        return res.status(400).json({
          code: 400,
          message: 'Reactions are disabled in this server due to its maximum support',
        });
      }

      let encoded = req.params.urlencoded as string;
      let dispatch_name = decodeURIComponent(encoded);
      let id: string | null = null;

      if (encoded.includes(':')) {
        id = encoded.split(':')[1];
        encoded = encoded.split(':')[0];
        dispatch_name = encoded;
      }

      const tryUnReact = await MessageService.removeMessageReaction(
        message.id,
        user.id,
        id,
        dispatch_name,
      );

      if (!tryUnReact) {
        return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
      }

      const payload = {
        channel_id: channel.id,
        message_id: message.id,
        user_id: user.id,
        emoji: {
          id: id,
          name: dispatch_name,
        },
      };

      if (guild)
        await dispatcher.dispatchEventInChannel(
          req.guild.id,
          channel.id,
          'MESSAGE_REACTION_REMOVE',
          payload,
        );
      else
        await dispatcher.dispatchEventInPrivateChannel(channel.id, 'MESSAGE_REACTION_REMOVE', payload);

      return res.status(204).send();
    } catch (error) {
      logText(error, 'error');

      return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
    }
  },
);

router.put(
  ['/:urlencoded/@me', '/:urlencoded/%40me'],
  rateLimitMiddleware(
    ctx.config!.ratelimit_config.addReaction.maxPerTimeFrame,
    ctx.config!.ratelimit_config.addReaction.timeFrame,
  ),
  async (req: Request, res: Response) => {
    try {
      const account = req.account;
      const channel = req.channel;
      const guild = req.guild;

      if (channel.type != ChannelType.DM && channel.type != ChannelType.GROUPDM && !guild) {
        return res.status(404).json(errors.response_404.UNKNOWN_CHANNEL);
      }

      const message = req.message;

      if (guild && guild.exclusions?.includes('reactions')) {
        return res.status(400).json({
          code: 400,
          message: 'Reactions are disabled in this server due to its maximum support',
        });
      }

      let encoded = req.params.urlencoded as string;
      let dispatch_name = decodeURIComponent(encoded);
      let id: string | null = null;

      if (encoded.includes(':')) {
        id = encoded.split(':')[1];
        encoded = encoded.split(':')[0];
        dispatch_name = encoded;
      }

      const reactionKey = JSON.stringify({
        id: id,
        name: dispatch_name,
      });

      if (
        message.reactions?.some(
          (x) => x.user_id === account.id && JSON.stringify(x.emoji) === reactionKey,
        )
      ) {
        return res.status(204).send(); //dont dispatch more than once
      }

      const reactionExists = message.reactions?.some((x) => JSON.stringify(x.emoji) === reactionKey);

      if (!reactionExists) {
        const canAdd = await permissions.hasChannelPermissionTo(
          req.channel.id,
          req.guild.id,
          req.account.id,
          'ADD_REACTIONS',
        );

        if (!canAdd) {
          return res.status(403).json(errors.response_403.MISSING_PERMISSIONS);
        }
      }

      const tryReact = await MessageService.addMessageReaction(message.id, account.id, id, encoded);

      if (!tryReact) {
        return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
      }

      const payload = {
        channel_id: channel.id,
        message_id: message.id,
        user_id: account.id,
        emoji: {
          id: id,
          name: dispatch_name,
        },
      };

      if (guild)
        await dispatcher.dispatchEventInChannel(
          req.guild.id,
          channel.id,
          'MESSAGE_REACTION_ADD',
          payload,
        );
      else await dispatcher.dispatchEventInPrivateChannel(channel.id, 'MESSAGE_REACTION_ADD', payload);

      return res.status(204).send();
    } catch (error) {
      logText(error, 'error');

      return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
    }
  },
);

router.get('/:urlencoded', cacheForMiddleware(60 * 5, "private", false), async (req: Request, res: Response) => {
  try {
    const channel = req.channel;
    const guild = req.guild;

    if (channel.type != ChannelType.DM && channel.type != ChannelType.GROUPDM && !guild) {
      return res.status(404).json(errors.response_404.UNKNOWN_CHANNEL);
    }

    const message = req.message;

    if (guild && guild.exclusions?.includes('reactions')) {
      return res.status(400).json({
        code: 400,
        message: 'Reactions are disabled in this server due to its maximum support',
      });
    }

    let encoded = req.params.urlencoded as string;
    let dispatch_name = decodeURIComponent(encoded);
    let id: string | null = null;

    if (encoded.includes(':')) {
      id = encoded.split(':')[1];
      encoded = encoded.split(':')[0];
      dispatch_name = encoded;
    }

    let queryLimit = req.query.limit as string;
    let limit = parseInt(queryLimit);

    if (limit > 100 || !limit) {
      limit = 100;
    }

    const reactions = message.reactions!!;
    const filteredReactions = reactions?.filter(
      (x) => x.emoji.name == dispatch_name && x.emoji.id == id,
    );

    const userIds = [...new Set(filteredReactions!!.map(r => r.user_id!!))];
    const users = await prisma.user.findMany({
      where: {
        id: { in: userIds }
      },
      select: PUBLIC_USER_SELECT
    });

    const return_users = users.map(u => ({
      id: u.id,
      username: u.username,
      discriminator: u.discriminator,
      avatar: u.avatar,
      bot: u.bot ?? false,
      premium: false
    }));

    return res.status(200).json(return_users);
  } catch (error) {
    logText(error, 'error');

    return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
  }
});

export default router;
