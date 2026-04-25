import { Router } from 'express';
import type { Response, Request } from 'express';

import dispatcher from '../helpers/dispatcher.js';
import errors from '../helpers/errors.ts';
import globalUtils from '../helpers/globalutils.ts';
import lazyRequest from '../helpers/lazyRequest.js';
import { logText } from '../helpers/logger.ts';
import { cacheForMiddleware, guildPermissionsMiddleware, rateLimitMiddleware, memberMiddleware } from '../helpers/middlewares.js';
import { GuildService } from './services/guildService.ts';
import { RoleService } from './services/roleService.ts';
import type { User } from '../types/user.ts';
import type { Member } from '../types/member.ts';
import ctx from '../context.ts';
import type { Guild } from '../types/guild.ts';

interface ErrorReponse {
  code: number;
  message: string;
}

const router = Router({ mergeParams: true });

router.get('/:memberid', memberMiddleware, cacheForMiddleware(60 * 30, "private", false), async (req: Request, res: Response) => {
  return res.status(200).json(req.member);
});

router.delete(
  '/:memberid',
  memberMiddleware,
  guildPermissionsMiddleware('KICK_MEMBERS'),
  rateLimitMiddleware(
    "kickMember"
  ),
  async (req: Request, res: Response) => {
    try {
      const sender = req.account;
      const member = req.member;

      if (member == null) {
        return res.status(404).json(errors.response_404.UNKNOWN_MEMBER);
      }

      const attempt = await GuildService.leave(member.user.id, req.params.guildid as string);

      if (!attempt) {
        return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
      }

      await dispatcher.dispatchEventTo(member.user.id, 'GUILD_DELETE', {
        id: req.params.guildid,
      });

      await dispatcher.dispatchEventInGuild(req.guild.id, 'GUILD_MEMBER_REMOVE', {
        type: 'kick',
        moderator: globalUtils.miniUserObject(sender as User),
        user: globalUtils.miniUserObject(member.user!! as User),
        guild_id: String(req.params.guildid),
      });

      return res.status(204).send();
    } catch (error) {
      logText(error, 'error');

      return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
    }
  },
);

async function updateMember(guild: Guild, member: Member, roles?: (string | { id: string })[], nick?: string) {
  let rolesChanged = false;
  let nickChanged = false;

  if (roles) {
    const newRoles: string[] = roles.map((r) => (typeof r === 'object' ? r.id : r));

    const currentRoles = [...member.roles!!].sort();
    const incomingRoles = [...newRoles].sort();

    if (JSON.stringify(currentRoles) !== JSON.stringify(incomingRoles)) {
      rolesChanged = true;

      const success = await RoleService.setRoles(guild.id, newRoles, member.id!!);

      if (!success) {
        return errors.response_500.INTERNAL_SERVER_ERROR as ErrorReponse;
      }

      member.roles = newRoles;
    }
  }

  if (nick !== undefined && nick !== member.nick) {
    if (nick === '' || nick === member.user.username) {
      nick = null as unknown as string;
    }
    if (
      nick &&
      (nick.length < ctx.config!.limits['nickname'].min ||
        nick.length >= ctx.config!.limits['nickname'].max)
    ) {
      return errors.response_400.INVALID_NICKNAME_LENGTH as ErrorReponse;
    }

    nickChanged = true;

    const success = await GuildService.updateGuildMemberNick(guild.id, member.user.id, nick);

    if (!success) {
      return errors.response_500.INTERNAL_SERVER_ERROR as ErrorReponse;
    }

    member.nick = nick;
  }

  if (rolesChanged || nickChanged) {
    const updatePayload = {
      roles: member.roles,
      user: globalUtils.miniUserObject(member.user!!),
      guild_id: guild.id,
      nick: member.nick,
    };

    await dispatcher.dispatchEventInGuild(guild.id, 'GUILD_MEMBER_UPDATE', updatePayload);
    await lazyRequest.syncMemberList(guild, member.id!!);
  }

  return {
    roles: member.roles,
    user: globalUtils.miniUserObject(member.user!!),
    guild_id: guild.id,
    nick: member.nick,
  };
}

router.patch(
  '/:memberid',
  memberMiddleware,
  guildPermissionsMiddleware('MANAGE_ROLES'),
  guildPermissionsMiddleware('MANAGE_NICKNAMES'),
  rateLimitMiddleware(
    "updateMember"
  ),
  async (req: Request, res: Response) => {
    try {
      const member = req.member;
      const guild = req.guild;

      const newMember = await updateMember(guild, member, req.body.roles, req.body.nick);

      if ("code" in newMember) {
        return res.status(newMember.code).json(newMember);
      }

      return res.status(200).json({
        user: globalUtils.miniUserObject(newMember.user),
        nick: newMember.nick,
        guild_id: req.guild.id,
        roles: newMember.roles,
        joined_at: new Date().toISOString(),
        deaf: false,
        mute: false,
      });
    } catch (error) {
      logText(error, 'error');

      return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
    }
  },
);

router.patch(
  '/@me/nick',
  guildPermissionsMiddleware('CHANGE_NICKNAME'),
  rateLimitMiddleware(
    "updateNickname"
  ),
  async (req: Request, res: Response) => {
    try {
      const account = req.account;
      const member = req.guild.members?.find((y) => y.id == account.id); 

      if (!member) {
        return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
      }

      const newMember = await updateMember(req.guild, member, undefined, req.body.nick);

      if ("code" in newMember) {
        return res.status(newMember.code).json(newMember);
      }

      return res.status(200).json({
        nick: req.body.nick,
      });
    } catch (error) {
      logText(error, 'error');

      return res.status(500).json(errors.response_500.INTERNAL_SERVER_ERROR);
    }
  },
);

export default router;