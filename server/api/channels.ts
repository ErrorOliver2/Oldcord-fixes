import { Router, type Request, type Response } from 'express';

import dispatcher from '../helpers/dispatcher.ts';
import errors from '../helpers/errors.ts';
import globalUtils from '../helpers/globalutils.ts';
import { logText } from '../helpers/logger.ts';
import {
  channelMiddleware,
  channelPermissionsMiddleware,
  guildPermissionsMiddleware,
  instanceMiddleware,
  rateLimitMiddleware,
} from '../helpers/middlewares.ts';
import messages from './messages.js';
import pins from './pins.js';
import { ChannelService } from './services/channelService.ts';
import { MessageService } from './services/messageService.ts';
import { InviteService } from './services/inviteService.ts';
import { WebhookService } from './services/webhookService.ts';
import lazyRequest from '../helpers/lazyRequest.ts';
import { ChannelType, type Channel } from '../types/channel.ts';
import { MessageType } from '../types/message.ts';

const router = Router({ mergeParams: true });
const config = globalUtils.config;

router.get(
  '/:channelid',
  channelMiddleware,
  channelPermissionsMiddleware('READ_MESSAGES'),
  async (req: Request, res: Response) => {
    return res
      .status(200)
      .json(globalUtils.personalizeChannelObject(req, req.channel!!, req.account!!)); //req.account is a dirty hack ok
  },
);

router.post(
  '/:channelid/typing',
  instanceMiddleware('VERIFIED_EMAIL_REQUIRED'),
  channelMiddleware,
  channelPermissionsMiddleware('SEND_MESSAGES'),
  rateLimitMiddleware(
    global.config.ratelimit_config.typing.maxPerTimeFrame,
    global.config.ratelimit_config.typing.timeFrame,
  ),
  async (req: Request, res: Response) => {
    try {
      const channel = req.channel!!;
      const account = req.account!!;

      var payload = {
        channel_id: req.params.channelid,
        guild_id: channel.guild_id,
        user_id: account!!.id,
        timestamp: new Date().toISOString(),
        member: req.member,
      };

      if (!req.guild) {
        if (channel.type !== ChannelType.GROUPDM && channel.type !== ChannelType.DM) {
          return res.status(404).json(errors.response_404.UNKNOWN_CHANNEL);
        }

        payload.member = globalUtils.miniUserObject(account);

        await dispatcher.dispatchEventInPrivateChannel(channel.id, 'TYPING_START', payload);
      } else {
        await dispatcher.dispatchEventInChannel(req.guild.id, channel.id, 'TYPING_START', payload);
      }

      return res.status(204).send();
    } catch (error) {
      logText(error, 'error');

      return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
    }
  },
);

router.patch(
  '/:channelid',
  instanceMiddleware('VERIFIED_EMAIL_REQUIRED'),
  channelMiddleware,
  channelPermissionsMiddleware('MANAGE_CHANNELS'),
  rateLimitMiddleware(
    global.config.ratelimit_config.updateChannel.maxPerTimeFrame,
    global.config.ratelimit_config.updateChannel.timeFrame,
  ),
  async (req: Request, res: Response) => {
    try {
      let channel = req.channel!!;

      if (!channel.guild_id && channel.type !== ChannelType.GROUPDM) {
        return res.status(404).json(errors.response_404.UNKNOWN_CHANNEL); //Can only modify guild channels lol -- okay update, they can modify group channels too
      }

      if (req.body.icon) {
        channel.icon = req.body.icon;
      }

      if (req.body.icon === null) {
        channel.icon = null;
      }

      if (
        req.body.name &&
        (req.body.name.length < global.config.limits['channel_name'].min ||
          req.body.name.length >= global.config.limits['channel_name'].max)
      ) {
        return res.status(400).json({
          code: 400,
          name: `Must be between ${global.config.limits['channel_name'].min} and ${global.config.limits['channel_name'].max} characters.`,
        });
      }

      if (req.body.name) {
        req.body.name = req.body.name.replace(/ /g, '-');
      } //For when you just update group icons

      channel.name = req.body.name ?? channel.name;

      if (channel.type !== ChannelType.GROUPDM && channel.type !== ChannelType.DM) {
        channel.position = req.body.position ?? channel.position;

        if (channel.type === ChannelType.TEXT) {
          channel.topic = req.body.topic ?? channel.topic;
          channel.nsfw = req.body.nsfw ?? channel.nsfw;

          const rateLimit = req.body.rate_limit_per_user ?? channel.rate_limit_per_user;

          channel.rate_limit_per_user = Math.min(Math.max(rateLimit, 0), 120);
        }

        if (channel.type === ChannelType.VOICE) {
          const userLimit = req.body.user_limit ?? channel.user_limit;
          channel.user_limit = Math.min(Math.max(userLimit, 0), 99);

          const bitrate = req.body.bitrate ?? channel.bitrate;
          channel.bitrate = Math.min(Math.max(bitrate, 8000), 96000);
        }
      } //do this for only guild channels

      const outcome = await ChannelService.updateChannel(channel.id, channel);

      if (!outcome) {
        return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
      }

      if (channel.type === ChannelType.GROUPDM) {
        channel = outcome;

        if (!channel) {
          return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
        }

        await dispatcher.dispatchEventInPrivateChannel(channel.id, 'CHANNEL_UPDATE', function (socket) {
          return globalUtils.personalizeChannelObject(socket, channel);
        });

        return res.status(200).json(channel);
      }

      if (!req.channel_types_are_ints) {
        channel.type = channel.type == ChannelType.VOICE ? 'voice' : 'text';
      }

      await dispatcher.dispatchEventToAllPerms(
        channel.guild_id!!,
        channel.id!!,
        'READ_MESSAGES',
        'CHANNEL_UPDATE',
        channel,
      );

      return res.status(200).json(channel);
    } catch (error) {
      logText(error, 'error');

      return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
    }
  },
);

router.get(
  '/:channelid/invites',
  instanceMiddleware('VERIFIED_EMAIL_REQUIRED'),
  channelMiddleware,
  channelPermissionsMiddleware('MANAGE_CHANNELS'),
  async (req: Request, res: Response) => {
    try {
      const invites = await ChannelService.getChannelInvites(req.params.channelid as string);

      return res.status(200).json(invites);
    } catch (error) {
      logText(error, 'error');

      return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
    }
  },
);

router.get(
  '/:channelid/call',
  channelMiddleware,
  async (req: Request, res: Response) => {
    try {
      const channel = req.channel!!;

      if (channel.type !== ChannelType.DM && channel.type !== ChannelType.GROUPDM) {
        return res.status(403).json(errors.response_403.MISSING_PERMISSIONS);
      } //This used to be checking if there were recipients on the channel object

      //do permission check for those not friends with the user (if in regular dms)

      return res.status(200).json({
        ringable: true,
      });
    } catch (error) {
      logText(error, 'error');

      return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
    }
  },
); //to-do figure out why this never gets to /ring

router.post(
  '/:channelid/call/ring',
  channelMiddleware,
  async (req: Request, res: Response) => {
    try {
      const channel = req.channel!!;

      if (channel.type !== ChannelType.DM && channel.type !== ChannelType.GROUPDM) {
        return res.status(403).json(errors.response_403.MISSING_PERMISSIONS);
      } //This used to be a recipients is undefined check

      const call_msg = await MessageService.createSystemMessage(null, channel.id, MessageType.CALL, [
        req.account,
      ]);

      await dispatcher.dispatchEventInPrivateChannel(channel.id, 'MESSAGE_CREATE', call_msg);

      return res.status(204).send();
    } catch (error) {
      logText(error, 'error');

      return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
    }
  },
);

router.post(
  '/:channelid/invites',
  instanceMiddleware('VERIFIED_EMAIL_REQUIRED'),
  channelMiddleware,
  channelPermissionsMiddleware('CREATE_INSTANT_INVITE'),
  async (req: Request, res: Response) => {
    try {
      const sender = req.account!!;
      const guild = req.guild!!;
      const channel = req.channel!!;

      if (config.instance.flags.includes('NO_INVITE_CREATION')) {
        return res.status(400).json({
          code: 400,
          message: 'Creating invites is not allowed.',
        });
      } //make an error code

      const invites = await ChannelService.getChannelInvites(req.params.channelid as string);

      if (invites.length >= global.config.limits['invites_per_guild'].max) {
        return res.status(400).json({
          code: 400,
          message: `Maximum number of invites per guild exceeded (${global.config.limits['invites_per_guild'].max})`,
        });
      }

      let max_age = req.body.max_age ?? 0;
      let max_uses = req.body.max_uses ?? 0;
      let temporary = req.body.xkcdpass ?? false;
      let xkcdpass = req.body.temporary ?? false;
      let regenerate = req.body.regenerate ?? true;

      const invite = await InviteService.createInvite(
        guild.id,
        channel.id,
        sender.id,
        temporary,
        max_uses,
        max_age,
        xkcdpass,
        regenerate,
      );

      if (invite == null) {
        return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
      }

      return res.status(200).json(invite);
    } catch (error) {
      logText(error, 'error');

      return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
    }
  },
);

router.use('/:channelid/messages', channelMiddleware, messages);

router.get(
  '/:channelid/webhooks',
  instanceMiddleware('VERIFIED_EMAIL_REQUIRED'),
  channelMiddleware,
  channelPermissionsMiddleware('MANAGE_WEBHOOKS'),
  async (req: Request, res: Response) => {
    try {
      const guild = req.guild!!;
      const channel = req.channel!!;
      const webhooks = guild.webhooks?.filter((x) => x.channel_id === channel.id);

      return res.status(200).json(webhooks);
    } catch (error) {
      logText(error, 'error');

      return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
    }
  },
);

router.post(
  '/:channelid/webhooks',
  instanceMiddleware('VERIFIED_EMAIL_REQUIRED'),
  channelMiddleware,
  channelPermissionsMiddleware('MANAGE_WEBHOOKS'),
  async (req: Request, res: Response) => {
    try {
      const account = req.account!!;
      const guild = req.guild!!;
      const channel = req.channel!!;

      if (!req.body.name) {
        req.body.name = 'Captain Hook';
      }

      const name = req.body.name;

      const webhook = await WebhookService.createWebhook(
        guild.id,
        account.id,
        channel.id,
        name
      );

      if (!webhook) {
        return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
      }

      return res.status(200).json(webhook);
    } catch (error) {
      logText(error, 'error');

      return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
    }
  },
);

router.put(
  '/:channelid/permissions/:id',
  instanceMiddleware('VERIFIED_EMAIL_REQUIRED'),
  channelMiddleware,
  guildPermissionsMiddleware('MANAGE_ROLES'),
  async (req: Request, res) => {
    try {
      const id = req.params.id;
      let type = req.body.type;

      if (!type) {
        type = 'role';
      }

      if (type != 'member' && type != 'role') {
        return res.status(404).json({
          code: 404,
          message: 'Unknown Type',
        });
      } //figure out this response

      let channel: Channel | null = req.channel!!;
      let guild = req.guild!!;

      const channel_overwrites = await ChannelService.getChannelPermissionOverwrites(
        channel.id
      );

      const overwrites = channel_overwrites;
      const overwriteIndex = channel_overwrites.findIndex((x) => x.id == id);

      let allow = 0;
      let deny = 0;

      const permissionValuesObject = permissions.toObject();
      const permissionKeys = Object.keys(permissionValuesObject);
      const keys = permissionKeys.map((key) => permissionValuesObject[key]);

      for (const permValue of keys) {
        if (req.body.allow & permValue) {
          allow |= permValue;
        }

        if (req.body.deny & permValue) {
          deny |= permValue;
        }
      }

      if (overwriteIndex === -1) {
        overwrites.push({
          id: id,
          allow: allow,
          deny: deny,
          type: type,
        });
      } else {
        overwrites[overwriteIndex] = {
          id: id,
          allow: allow,
          deny: deny,
          type: type,
        };
      }

      if (type == 'member') {
        const member = guild.members?.find((x) => x.id === id);

        if (member == null) {
          return res.status(404).json(errors.response_404.UNKNOWN_MEMBER);
        }
      } else if (type == 'role') {
        const role = guild.roles?.find((x) => x.id === id);

        if (role == null) {
          return res.status(404).json(errors.response_404.UNKNOWN_ROLE);
        }
      }

      await ChannelService.updateChannelPermissionOverwrites(channel.id, overwrites);

      channel = await ChannelService.getChannelById(channel.id); //do this better

      if (!req.channel_types_are_ints) {
        channel!!.type = channel!!.type == ChannelType.VOICE ? 'voice' : 'text';
      }

      await dispatcher.dispatchEventInChannel(req.guild!!.id, channel!!.id, 'CHANNEL_UPDATE', channel);
      await lazyRequest.syncMemberList(req.guild, req.account!!.id); //do this just in case they deny/allow everyone to view a previously locked off/just unlocked channel

      return res.status(204).send();
    } catch (error) {
      logText(error, 'error');

      return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
    }
  },
);

router.delete(
  '/:channelid/permissions/:id',
  instanceMiddleware('VERIFIED_EMAIL_REQUIRED'),
  channelMiddleware,
  guildPermissionsMiddleware('MANAGE_ROLES'),
  async (req: Request, res) => {
    try {
      const id = req.params.id;
      const channel_id = req.params.channelid as string;

      let channel: Channel | null = req.channel!!;

      const channel_overwrites = await ChannelService.getChannelPermissionOverwrites(
        channel.id
      );

      const overwriteIndex = channel_overwrites.findIndex((x) => x.id == id);

      if (!req.channel_types_are_ints) {
        channel.type = channel.type == ChannelType.VOICE ? 'voice' : 'text';
      }

      if (overwriteIndex === -1) {
        await dispatcher.dispatchEventInChannel(req.guild!!.id, channel.id, 'CHANNEL_UPDATE', channel);

        return res.status(204).send();
      }

      await ChannelService.deleteChannelPermissionOverwrite(
        channel_id,
        channel_overwrites[overwriteIndex],
      );

      channel = await ChannelService.getChannelById(channel.id); //do this better

      if (!channel?.guild_id) {
        return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
      }

      if (!req.channel_types_are_ints) {
        channel.type = channel.type == ChannelType.VOICE ? 'voice' : 'text';
      }

      await dispatcher.dispatchEventInChannel(req.guild!!.id, channel.id, 'CHANNEL_UPDATE', channel);
      await lazyRequest.syncMemberList(req.guild, req.account!!.id); //do this just in case they deny/allow everyone to view a previously 

      return res.status(204).send();
    } catch (error) {
      logText(error, 'error');

      return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
    }
  },
);

//TODO: should have its own rate limit
router.put(
  '/:channelid/recipients/:recipientid',
  instanceMiddleware('VERIFIED_EMAIL_REQUIRED'),
  channelMiddleware,
  rateLimitMiddleware(
    global.config.ratelimit_config.updateMember.maxPerTimeFrame,
    global.config.ratelimit_config.updateMember.timeFrame,
  ),
  async (req: Request, res) => {
    try {
      const sender = req.account!!;
      const channel = req.channel!!;

      if (channel.type !== ChannelType.GROUPDM) {
        return res.status(403).json({
          code: 403,
          message: 'Cannot add members to this type of channel.',
        });
      } //find the error

      if (!channel.recipients?.find((x) => x.id === sender.id)) {
        return res.status(404).json(errors.response_404.UNKNOWN_CHANNEL);
      }

      if (channel.recipients.length > 9) {
        return res.status(403).json({
          code: 403,
          message: 'Maximum number of members for group reached (10).',
        });
      }

      const recipient = req.recipient;

      if (recipient == null) {
        return res.status(404).json(errors.response_404.UNKNOWN_USER);
      }

      if (!globalUtils.areWeFriends(sender, recipient)) {
        return res.status(403).json({
          code: 403,
          message: 'You are not friends with the recipient.',
        }); //figure this one out
      }

      //Add recipient
      channel.recipients.push(recipient);

      if (!(await ChannelService.updateChannelRecipients(channel.id, channel.recipients)))
        throw 'Failed to update recipients list in channel';

      //Notify everyone else
      await dispatcher.dispatchEventInPrivateChannel(channel.id, 'CHANNEL_UPDATE', function (socket) {
        return globalUtils.personalizeChannelObject(socket, channel);
      });

      //Notify new recipient
      await globalUtils.pingPrivateChannelUser(channel, recipient.id);

      const add_msg = await MessageService.createSystemMessage(null, channel.id, MessageType.ADD_TO_GROUP, [
        sender,
        recipient,
      ]);

      await dispatcher.dispatchEventInPrivateChannel(channel.id, 'MESSAGE_CREATE', add_msg);

      return res.status(204).send();
    } catch (error) {
      logText(error, 'error');

      return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
    }
  },
);

router.delete(
  '/:channelid/recipients/:recipientid',
  instanceMiddleware('VERIFIED_EMAIL_REQUIRED'),
  channelMiddleware,
  rateLimitMiddleware(
    global.config.ratelimit_config.updateMember.maxPerTimeFrame,
    global.config.ratelimit_config.updateMember.timeFrame,
  ),
  async (req: Request, res) => {
    try {
      const sender = req.account!!;
      const channel = req.channel!!;

      if (channel.type !== ChannelType.GROUPDM) {
        return res.status(403).json({
          code: 403,
          message: 'Cannot remove members from this type of channel.',
        });
      }

      if (channel.owner_id !== sender.id) {
        return res.status(403).json(errors.response_403.MISSING_PERMISSIONS);
      }

      const recipient = req.recipient;

      if (recipient == null) {
        return res.status(404).json(errors.response_404.UNKNOWN_USER);
      }

      //Remove recipient
      channel.recipients = channel.recipients?.filter((recip) => recip.id !== recipient.id);

      if (!(await ChannelService.updateChannelRecipients(channel.id, channel.recipients!!)))
        throw 'Failed to update recipients list in channel';

      //Notify everyone else
      await dispatcher.dispatchEventInPrivateChannel(channel.id, 'CHANNEL_UPDATE', function (socket) {
        return globalUtils.personalizeChannelObject(socket, channel);
      });

      const remove_msg = await MessageService.createSystemMessage(null, channel.id, MessageType.REMOVE_FROM_GROUP, [
        recipient,
      ]);

      await dispatcher.dispatchEventInPrivateChannel(channel.id, 'MESSAGE_CREATE', remove_msg);

      return res.status(204).send();
    } catch (error) {
      logText(error, 'error');

      return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
    }
  },
);

router.delete(
  '/:channelid',
  instanceMiddleware('VERIFIED_EMAIL_REQUIRED'),
  channelMiddleware,
  guildPermissionsMiddleware('MANAGE_CHANNELS'),
  rateLimitMiddleware(
    global.config.ratelimit_config.deleteChannel.maxPerTimeFrame,
    global.config.ratelimit_config.deleteChannel.timeFrame,
  ),
  async (req: Request, res) => {
    try {
      const sender = req.account!!;
      const channel = req.channel!!;

      if (channel.type !== ChannelType.GROUPDM && channel.type !== ChannelType.DM) {
        if (req.guild && req.guild.channels?.length === 1) {
          return res.status(400).json({
            code: 400,
            message: 'You cannot delete all channels in this server',
          });
        }
      } //Should we let them delete all channels in the server?

      if (channel.type == ChannelType.DM || channel.type == ChannelType.GROUPDM) {
        //Leaving a private channel
        const userPrivateChannels = await ChannelService.getPrivateChannels(sender.id);

        if (!userPrivateChannels) {
          return res.status(404).json(errors.response_404.UNKNOWN_CHANNEL);
        }

        //TODO: Elegant but inefficient
        const newUserPrivateChannels = userPrivateChannels.filter((id) => id != channel.id);

        if (newUserPrivateChannels.length == userPrivateChannels.length) {
          return res.status(404).json(errors.response_404.UNKNOWN_CHANNEL);
        }

        const tryUpdate = await ChannelService.setPrivateChannels(
          sender.id,
          newUserPrivateChannels,
        );

        if (!tryUpdate) {
          return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
        }

        await dispatcher.dispatchEventTo(sender.id, 'CHANNEL_DELETE', {
          id: channel.id,
          guild_id: null,
        });

        if (channel.type == ChannelType.GROUPDM) {
          const newRecipientsList = channel.recipients?.filter(
            (recipientObject) => recipientObject.id !== sender.id,
          );

          channel.recipients = newRecipientsList;

          //handover logic
          if (channel.owner_id === sender.id && newRecipientsList!!.length > 0) {
            const newOwnerId = newRecipientsList!![0].id;

            channel.owner_id = newOwnerId;

            if (!(await ChannelService.updateChannel(channel.id, channel, true))) {
              throw 'Failed to transfer ownership of group channel';
            }
          } else if (newRecipientsList!!.length === 0) {
            await ChannelService.deleteChannel(channel.id);
            return res.status(204).send(); //delete group channel to free up the db
          }

          if (!(await ChannelService.updateChannelRecipients(channel.id, newRecipientsList!!)))
            throw 'Failed to update recipients list in channel';

          await dispatcher.dispatchEventInPrivateChannel(channel.id, 'CHANNEL_UPDATE', function (socket) {
            return globalUtils.personalizeChannelObject(socket, channel);
          });
        }
      } else {
        //Deleting a guild channel
        if (req.params.channelid == req.params.guildid) {
          //TODO: Allow on 2018+ guilds
          return res.status(403).json({
            code: 403,
            message: 'The main channel cannot be deleted.',
          });
        }

        await dispatcher.dispatchEventInChannel(req.guild!!.id, channel.id, 'CHANNEL_DELETE', {
          id: channel.id,
          guild_id: channel.guild_id,
        });

        if (!(await ChannelService.deleteChannel(channel.id))) {
          return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
        }
      }

      return res.status(204).send();
    } catch (error) {
      logText(error, 'error');

      return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
    }
  },
);

router.use(
  '/:channelid/pins',
  instanceMiddleware('VERIFIED_EMAIL_REQUIRED'),
  rateLimitMiddleware(
    global.config.ratelimit_config.pins.maxPerTimeFrame,
    global.config.ratelimit_config.pins.timeFrame,
  ),
  pins
);

export default router;
