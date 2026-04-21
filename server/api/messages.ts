import { json, Router } from 'express';
import ffmpeg from 'fluent-ffmpeg';
const { ffprobe } = ffmpeg;
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { Jimp } from 'jimp';
import multer from 'multer';
import { extname, join } from 'path';

import dispatcher from '../helpers/dispatcher.ts';
import errors from '../helpers/errors.ts';
import globalUtils from '../helpers/globalutils.ts';
import { logText } from '../helpers/logger.ts';
import {
  cacheForMiddleware,
  channelPermissionsMiddleware,
  instanceMiddleware,
  rateLimitMiddleware,
} from '../helpers/middlewares.ts';
import Snowflake from '../helpers/snowflake.ts';
import reactions from './reactions.ts';
import { AccountService } from './services/accountService.ts';
import { MessageService } from './services/messageService.ts';
import type { NextFunction, Request, Response } from "express";
import { ChannelType } from '../types/channel.ts';
import type { Account } from '../types/account.ts';
import { RelationshipType } from '../types/relationship.ts';
import { GuildService } from './services/guildService.ts';
import type { Message } from '../types/message.ts';
import permissions from '../helpers/permissions.ts';
import ctx from '../context.ts';

const upload = multer();
const router = Router({ mergeParams: true });

router.use('/:messageid/reactions', instanceMiddleware('VERIFIED_EMAIL_REQUIRED'), reactions);

function handleJsonAndMultipart(req: Request, res: Response, next: NextFunction) {
  const contentType = req.headers['content-type'];
  if (contentType && contentType.startsWith('multipart/form-data')) {
    upload.any()(req, res, next);
  } else {
    json()(req, res, next);
  }
}

//..We shouldn't cache this

router.get(
  '/',
  channelPermissionsMiddleware('READ_MESSAGES'),
  async (req: Request, res: Response) => {
    try {
      const creator = req.account!!;
      const channel = req.channel!!;

      if (channel.type === ChannelType.VOICE) {
        return res.status(400).json({
          code: 400,
          message: 'Cannot get text messages from a voice channel.', //I mean we're cool with you doing that and everything but realistically, who is going to read these messages?
        }); //whats the proper response here?
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const { around, before, after } = req.query as Record<string, string>;

      const includeReactions =
        (req.guild && !req.guild.exclusions?.includes('reactions')) ||
        channel.type === ChannelType.DM ||
        channel.type === ChannelType.GROUPDM;

      let messages: Message[];

      if (around) {
        messages = await MessageService.getMessagesAround(channel.id, around, limit);
      } else {
        messages = await MessageService.getChannelMessages(
          channel.id,
          limit,
          before,
          after,
          creator.id,
          includeReactions
        );
      }

      const personalized = messages.map((m) =>
        globalUtils.personalizeMessageObject(m, req.guild, req.client_build_date)
      );

      return res.status(200).json(personalized);
    } catch (error) {
      logText(error, 'error');

      return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
    }
  },
);

router.post(
  '/',
  instanceMiddleware('VERIFIED_EMAIL_REQUIRED'),
  handleJsonAndMultipart,
  channelPermissionsMiddleware('SEND_MESSAGES'),
  rateLimitMiddleware(
    ctx.config!.ratelimit_config.sendMessage.maxPerTimeFrame,
    ctx.config!.ratelimit_config.sendMessage.timeFrame,
  ),
  async (req: Request, res: Response) => {
    try {
      const account = req.account!!;
      const author = account;
      const channel = req.channel!!;

      if (channel.type === ChannelType.VOICE) {
        return res.status(400).json({
          code: 400,
          message: 'Cannot send a text message in a voice channel.', //I mean we're cool with you doing that and everything but realistically, who is going to read these messages?
        });
      }

      if (req.body.payload_json) {
        try {
          const payload = JSON.parse(req.body.payload_json);

          req.body = { ...req.body, ...payload };
        } catch (e) {
          return res.status(400).json({ message: 'Invalid payload_json format' });
        }
      }

      if (req.body.content && typeof req.body.content === 'string') {
        req.body.content = req.body.content.trim();
      }

      if (
        !req.body.embeds &&
        !req.files &&
        (!req.body.content || typeof req.body.content !== 'string' || req.body.content === '')
      ) {
        return res.status(400).json(errors.response_400.CANNOT_SEND_EMPTY_MESSAGE);
      } //this aswell

      if (req.body.content && !req.body.embeds) {
        const min = ctx.config!.limits['messages'].min;
        const max = ctx.config!.limits['messages'].max;

        if (req.body.content.length < min || req.body.content.length > max) {
          return res.status(400).json({
            code: 400,
            content: `Must be between ${min} and ${max} characters.`,
          });
        }
      }

      let embeds: any[] = []; //So... discord removed the ability for users to create embeds in their messages way back in like 2020, killing the whole motive of self bots, but here at Oldcord, we don't care - just don't abuse our API.

      if (
        req.body.embeds &&
        !req.files &&
        (!Array.isArray(req.body.embeds) || req.body.embeds.length === 0)
      ) {
        return res.status(400).json(errors.response_400.CANNOT_SEND_EMPTY_MESSAGE);
      }

      const MAX_EMBEDS = 10; //to-do make this configurable
      const proxyUrl = (url) => {
        return url ? `/proxy/${encodeURIComponent(url)}` : null;
      };

      if (Array.isArray(req.body.embeds)) {
        embeds = req.body.embeds.slice(0, MAX_EMBEDS).map((embed) => {
          const embedObj = {
            type: 'rich',
            color: embed.color ?? 7506394,
          } as any;

          if (embed.title) embedObj.title = embed.title;
          if (embed.description) embedObj.description = embed.description;
          if (embed.url) embedObj.url = embed.url;
          if (embed.timestamp) embedObj.timestamp = embed.timestamp;

          if (embed.author) {
            const icon = proxyUrl(embed.author.icon_url);

            embedObj.author = {
              name: embed.author.name ?? null,
              url: embed.author.url ?? null,
              icon_url: icon,
              proxy_icon_url: icon,
            };
          }

          if (embed.thumbnail?.url) {
            const thumb = proxyUrl(embed.thumbnail.url);

            const raw_width = embed.thumbnail.width ?? 400;
            const raw_height = embed.thumbnail.height ?? 400;

            embedObj.thumbnail = {
              url: thumb,
              proxy_url: thumb,
              width: Math.min(Math.max(raw_width, 400), 800),
              height: Math.min(Math.max(raw_height, 400), 800),
            };
          }

          if (embed.image?.url) {
            const img = proxyUrl(embed.image.url);

            const raw_width = embed.image.width ?? 400;
            const raw_height = embed.image.height ?? 400;

            embedObj.image = {
              url: img,
              proxy_url: img,
              width: Math.min(Math.max(raw_width, 400), 800),
              height: Math.min(Math.max(raw_height, 400), 800),
            };
          }

          if (embed.footer) {
            const footerIcon = proxyUrl(embed.footer.icon_url);

            embedObj.footer = {
              text: embed.footer.text ?? null,
              icon_url: footerIcon,
              proxy_icon_url: footerIcon,
            };
          }

          if (Array.isArray(embed.fields) && embed.fields.length > 0) {
            embedObj.fields = embed.fields.map((f) => ({
              name: f.name ?? '',
              value: f.value ?? '',
              inline: !!f.inline,
            }));
          }

          return embedObj;
        });
      }

      const mentions_data = globalUtils.parseMentions(req.body.content);

      if (
        (mentions_data.mention_everyone || mentions_data.mention_here) &&
        !await permissions.hasChannelPermissionTo(
          req.channel,
          req.guild,
          author.id,
          'MENTION_EVERYONE',
        )
      ) {
        mentions_data.mention_everyone = false;
        mentions_data.mention_here = false;
      }

      if (mentions_data.mention_here) {
        mentions_data.mention_everyone = true;
      } //just make sure both are set to true

      //Coerce tts field to boolean
      req.body.tts = req.body.tts === true || req.body.tts === 'true';

      if (!channel.recipients) {
        if (!req.guild) {
          return res.status(404).json(errors.response_404.UNKNOWN_GUILD);
        }

        if (!channel.guild_id) {
          return res.status(404).json(errors.response_404.UNKNOWN_CHANNEL);
        }
      }

      if (channel.recipients) {
        //DM/Group channel rules

        //Disable @everyone and @here for DMs and groups
        mentions_data.mention_everyone = false;
        mentions_data.mention_here = false;

        if (channel.type !== ChannelType.DM && channel.type !== ChannelType.GROUPDM) {
          //Not a DM channel or group channel
          return res.status(404).json(errors.response_404.UNKNOWN_CHANNEL);
        }

        if (channel.type == ChannelType.DM) {
          //DM channel

          //Need a complete user object for the relationships
          const recipientID = channel.recipients[channel.recipients[0].id == author.id ? 1 : 0].id;
          const recipient = await AccountService.getById(recipientID) as Account;

          if (!recipient) {
            return res.status(404).json(errors.response_404.UNKNOWN_USER);
          }

          const ourFriends = account.relationships;
          const theirFriends = recipient.relationships;
          let ourRelationshipState = ourFriends?.find((x) => x.user.id == recipient.id);
          let theirRelationshipState = theirFriends?.find((x) => x.user.id == account.id);

          if (!account.bot && !ourRelationshipState) {
            ourFriends.push({
              id: recipient.id,
              type: RelationshipType.NONE,
              user: globalUtils.miniUserObject(recipient),
            });

            ourRelationshipState = ourFriends.find((x) => x.user.id == recipient.id);
          }

          if (!recipient.bot && !theirRelationshipState) {
            theirFriends.push({
              id: account.id,
              type: RelationshipType.NONE,
              user: globalUtils.miniUserObject(account),
            });

            theirRelationshipState = theirFriends.find((x) => x.user.id == account.id);
          }

          if (ourRelationshipState?.type === RelationshipType.BLOCKED || theirRelationshipState?.type === RelationshipType.BLOCKED) {
            return res.status(403).json(errors.response_403.CANNOT_SEND_MESSAGES_TO_THIS_USER);
          }

          const mutualGuilds = await GuildService.getMutualGuilds(recipient.id, account.id);

          if (recipient.bot && mutualGuilds.length === 0) {
             return res.status(403).json(errors.response_403.CANNOT_SEND_MESSAGES_TO_THIS_USER);
          }

          if (!recipient.bot && !globalUtils.areWeFriends(account, recipient)) {
            const hasAllowedSharedGuild = mutualGuilds.some((guild) => {
              const senderAllows = !account.settings!.restricted_guilds!.includes(guild.id);
              const recipientAllows = !recipient.settings!.restricted_guilds!.includes(guild.id);

              return senderAllows && recipientAllows;
            });

            if (ctx.config!.require_friendship_for_dm) {
              return res.status(403).json(errors.response_403.CANNOT_SEND_MESSAGES_TO_THIS_USER);
            }

            if (mutualGuilds.length === 0 || !hasAllowedSharedGuild) {
              return res.status(403).json(errors.response_403.CANNOT_SEND_MESSAGES_TO_THIS_USER);
            }
          }
        }
      } else {
        //Guild rules
        const canUseEmojis = !req.guild!!.exclusions!!.includes('custom_emoji');

        const emojiPattern = /<:[\w-]+:\d+>/g;

        const hasEmojiFormat = emojiPattern.test(req.body.content);

        if (hasEmojiFormat && !canUseEmojis) {
          return res.status(400).json({
            code: 400,
            message: 'Custom emojis are disabled in this server due to its maximum support',
          });
        }

        if (
          req.body.tts &&
          !await permissions.hasChannelPermissionTo(
            req.channel,
            req.guild,
            author.id,
            'SEND_TTS_MESSAGES',
          )
        ) {
          //Not allowed
          req.body.tts = false;
        }

        if (
          channel.rate_limit_per_user!! > 0 &&
          !await permissions.hasChannelPermissionTo(
            req.channel,
            req.guild,
            author.id,
            'MANAGE_CHANNELS',
          ) &&
          !await permissions.hasChannelPermissionTo(
            req.channel,
            req.guild,
            author.id,
            'MANAGE_MESSAGES',
          )
        ) {
          const key = `${author.id}-${channel.id}`;
          const ratelimit = channel.rate_limit_per_user!! * 1000;
          const currentTime = Date.now();
          const lastMessageTimestamp = ctx.slowmodeCache.get(key) || 0;
          const difference = currentTime - lastMessageTimestamp;

          if (difference < ratelimit) {
            const waitTime = ratelimit - difference;

            return res.status(429).json({
              ...errors.response_429.SLOWMODE_RATE_LIMIT,
              retry_after: waitTime,
            });
          }

          ctx.slowmodeCache.set(key, currentTime);
        } //Slowmode implementation
      }

      const file_details: any[] = [];

      if (req.files) {
        for (var file of req.files) {
          if (file.size >= ctx.config!.limits['attachments'].max_size) {
            return res.status(400).json({
              code: 400,
              message: `Message attachments cannot be larger than ${ctx.config!.limits['attachments'].max_size} bytes.`,
            });
          }

          const file_detail = {
            id: Snowflake.generate(),
            size: file.size,
          } as any;

          file_detail.name = globalUtils
            .replaceAll(file.originalname, ' ', '_')
            .replace(/[^A-Za-z0-9_\-.()\[\]]/g, '');
          file_detail.filename = file_detail.name;

          if (!file_detail.name || file_detail.name == '') {
            return res.status(403).json({
              code: 403,
              message: 'Invalid filename',
            });
          }

          const channelDir = join('.', 'www_dynamic', 'attachments', channel.id);
          const attachmentDir = join(channelDir, file_detail.id);
          const file_path = join(attachmentDir, file_detail.name);

          file_detail.url = `${globalUtils.config.secure ? 'https' : 'http'}://${globalUtils.config.base_url}${globalUtils.nonStandardPort ? `:${globalUtils.config.port}` : ''}/attachments/${channel.id}/${file_detail.id}/${file_detail.name}`;

          if (!existsSync(attachmentDir)) {
            mkdirSync(attachmentDir, { recursive: true });
          }

          writeFileSync(file_path, file.buffer);

          const isVideo = file_path.endsWith('.mp4') || file_path.endsWith('.webm');

          if (isVideo) {
            try {
              await new Promise<void>((resolve, reject) => {
                ffmpeg(file_path)
                  .on('end', () => {
                    ffprobe(file_path, (err, metadata) => {
                      const vid_metadata = metadata.streams.find((x) => x.codec_type === 'video');

                      if (!err && vid_metadata) {
                        file_detail.width = vid_metadata.width;
                        file_detail.height = vid_metadata.height;
                      }

                      resolve();
                    });
                  })
                  .on('error', (err) => {
                    logText(err, 'error');
                    reject(err);
                  })
                  .screenshots({
                    count: 1,
                    timemarks: ['1'],
                    filename: 'thumbnail.png',
                    folder: attachmentDir,
                  });
              });
            } catch (error) {
              file_detail.width = 500;
              file_detail.height = 500;
            }
          } else {
            const imageExtensions = ['.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.gif'];
            const fileExt = extname(file_detail.name).toLowerCase();

            if (imageExtensions.includes(fileExt)) {
              try {
                const image = await Jimp.read(file.buffer);
                if (image) {
                  file_detail.width = image.bitmap.width;
                  file_detail.height = image.bitmap.height;
                }
              } catch (error) {
                file_detail.width = 500;
                file_detail.height = 500;

                logText(
                  'Failed to parse image dimension - possible vulnerability attempt?',
                  'warn',
                );
              }
            } else {
              file_detail.width = 0;
              file_detail.height = 0;
            }
          }

          file_details.push(file_detail);
        }
      }

      //Write message
      const message = await MessageService.createMessage(req.guild?.id ?? null, channel.id, author.id, req.body.content, req.body.nonce, file_details, req.body.tts, mentions_data, embeds);

      if (!message) throw 'Message creation failed';

      if (mentions_data.mention_everyone || mentions_data.mention_here) {
        ctx.database
          .incrementMentions(
            channel.id,
            req.guild!!.id,
            mentions_data.mention_here ? 'here' : 'everyone',
          )
          .catch((err) => logText(err, 'error'));
      }

      //Dispatch to correct recipients(s) in DM, group, or guild
      if (channel.recipients) {
        await globalUtils.pingPrivateChannel(channel);
        await dispatcher.dispatchEventInPrivateChannel(channel.id, 'MESSAGE_CREATE', message);
      } else {
        await dispatcher.dispatchEventInChannel(
          req.guild!!.id,
          req.channel!!.id,
          'MESSAGE_CREATE',
          message,
        );
      }

      //Acknowledge immediately to author
      //gotta do this
      const tryAck = await MessageService.acknowledgeMessage(
          author.id,
          req.channel!!.id,
          message.id,
          0,
      );

      if (!tryAck) throw 'Message acknowledgement failed';

      await dispatcher.dispatchEventTo(author.id, 'MESSAGE_ACK', {
        channel_id: req.channel!!.id,
        message_id: message.id,
        manual: false, //This is for if someone clicks mark as read
      });

      return res.status(200).json(message);
    } catch (error) {
      logText(error, 'error');

      return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
    }
  },
);

router.delete(
  '/:messageid',
  instanceMiddleware('VERIFIED_EMAIL_REQUIRED'),
  channelPermissionsMiddleware('MANAGE_MESSAGES'),
  rateLimitMiddleware(
    ctx.config!.ratelimit_config.deleteMessage.maxPerTimeFrame,
    ctx.config!.ratelimit_config.deleteMessage.timeFrame,
  ),
  async (req: Request, res: Response) => {
    try {
      const guy = req.account!!;
      const message = req.message!!;
      const channel = req.channel!!;
      const guild = req.guild!!;

      if (!channel.recipients && !channel.guild_id) {
        return res.status(404).json(errors.response_404.UNKNOWN_CHANNEL);
      }

      if (channel.recipients && message.author.id != guy.id) {
        return res.status(403).json(errors.response_403.MISSING_PERMISSIONS);
      }

      if (!(await MessageService.deleteMessage(req.params.messageid as string)))
        throw 'Message deletion failed';

      const payload = {
        id: req.params.messageid,
        guild_id: channel.guild_id,
        channel_id: req.params.channelid,
      };

      if (channel.recipients)
        await dispatcher.dispatchEventInPrivateChannel(channel.id, 'MESSAGE_DELETE', payload);
      else
        await dispatcher.dispatchEventInChannel(guild.id, channel.id, 'MESSAGE_DELETE', payload);

      return res.status(204).send();
    } catch (error) {
      logText(error, 'error');

      return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
    }
  },
);

router.patch(
  '/:messageid',
  instanceMiddleware('VERIFIED_EMAIL_REQUIRED'),
  rateLimitMiddleware(
    ctx.config!.ratelimit_config.updateMessage.maxPerTimeFrame,
    ctx.config!.ratelimit_config.updateMessage.timeFrame,
  ),
  async (req: Request, res: Response) => {
    try {
      if (req.body.content && req.body.content == '') {
        return res.status(403).json(errors.response_403.MISSING_PERMISSIONS); //This should be another error
      }

      const caller = req.account!!;
      let message: Message | null = req.message!!;
      const channel = req.channel!!;

      if (!channel.recipients && !channel.guild_id) {
        return res.status(404).json(errors.response_404.UNKNOWN_CHANNEL);
      }

      if (message.author.id != caller.id) {
        return res.status(403).json(errors.response_403.MISSING_PERMISSIONS);
      }

      //TODO:
      //FIXME: this needs to use globalUtils.parseMentions
      if (req.body.content && req.body.content.includes('@everyone')) {
        const pCheck = await permissions.hasChannelPermissionTo(
          req.channel,
          req.guild,
          message.author.id,
          'MENTION_EVERYONE',
        );

        if (!pCheck) {
          req.body.content = req.body.content.replace(/@everyone/g, '');
        }
      }

      const update = await MessageService.updateMessage(message.id, req.body.content);

      if (!update) throw 'Message update failed';

      if (channel.recipients)
        await dispatcher.dispatchEventInPrivateChannel(channel.id, 'MESSAGE_UPDATE', update);
      else
        await dispatcher.dispatchEventInChannel(req.guild!!.id, channel.id, 'MESSAGE_UPDATE', update);

      return res.status(204).send();
    } catch (error) {
      logText(error, 'error');

      return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
    }
  },
);

router.post(
  '/:messageid/ack',
  instanceMiddleware('VERIFIED_EMAIL_REQUIRED'),
  rateLimitMiddleware(
    ctx.config!.ratelimit_config.ackMessage.maxPerTimeFrame,
    ctx.config!.ratelimit_config.ackMessage.timeFrame,
  ),
  async (req: Request, res: Response) => {
    try {
      const guy = req.account!!;
      const message = req.message!!;
      const channel = req.channel!!;
      const manual = req.body.manual === true;

      const success = await MessageService.acknowledgeMessage(
          guy.id,
          channel.id,
          message.id,
          0
      );

      if (!success) throw 'Message acknowledgement failed';

      await dispatcher.dispatchEventTo(guy.id, 'MESSAGE_ACK', {
        channel_id: channel.id,
        message_id: message.id,
        manual: manual, //This is for if someone clicks mark as read
      });

      const ackToken = globalUtils.generateAckToken(guy.id, message.id);

      return res.status(200).json({
        token: ackToken
      });
    } catch (error) {
      logText(error, 'error');

      return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
    }
  },
);

export default router;
