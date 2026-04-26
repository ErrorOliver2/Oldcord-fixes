import { prisma } from '../prisma.ts';
import dispatcher from '../helpers/dispatcher.ts';
import globalUtils from '../helpers/globalutils.ts';
import lazyRequest from '../helpers/lazyRequest.ts';
import session from '../helpers/session.js';
import type WebSocket from 'ws';
import { GatewayOpcode, type GatewayHeartbeatPacket, type GatewayIdentifyPacket, type GatewayLazyFetchPacket, type GatewayMemberChunksPacket, type GatewayPresencePacket, type GatewayResumePacket, type GatewayVoiceStatePacket } from '../types/gateway.ts';
import type { AccountSettings } from '../types/account.ts';
import { ChannelType } from '../types/channel.ts';
import permissions from '../helpers/permissions.ts';
import type { User } from '../types/user.ts';
import type { Member } from '../types/member.ts';
import { logText } from '../helpers/logger.ts';
import ctx from '../context.ts';
import type { Session } from '../types/session.ts';

async function handleIdentify(socket: WebSocket, packet: GatewayIdentifyPacket) {
  const { token, intents, presence, capabilities } = packet.d; //to-do should we use capabilities?

  if (socket.session) {
    return socket.close(4005, 'You have already identified.');
  }

  const user = await prisma.user.findUnique({
    where: {
      token: token
    },
    select: {
      disabled_until: true,
      username: true,
      discriminator: true,
      avatar: true,
      premium: true,
      flags: true,
      id: true,
      bot: true,
      settings: true,
      email: true
    }
  })

  if (!user || user.disabled_until) {
    return socket.close(4004, 'Authentication failed');
  }

  ctx.gateway?.debug(`Client identified: ${user.username} (${user.id})`);

  if (intents != null) {
    ctx.gatewayIntentMap.set(user.id, Number(intents));
  } else {
    ctx.gatewayIntentMap.delete(user.id);
  }

  const savedStatus = user.bot ? 'online' : ((user.settings as AccountSettings).status || 'online');
  const finalStatus = (presence?.status === savedStatus) ? presence.status : savedStatus;

  socket.user_id = user.id;
  socket.session = new session(
    globalUtils.generateString(16),
    socket,
    user, //move to user_id here
    token,
    false,
    {
      game_id: null,
      status: finalStatus,
      activities: [],
      user: globalUtils.miniUserObject(user as User),
      roles: [],
    },
    "gateway",
    undefined,
    undefined,
    socket.apiVersion,
    capabilities ?? socket.client_build_date,
  );

  socket.session.start();
  await socket.session.prepareReady();
  await socket.session.updatePresence(finalStatus, null, false, true);

  await prisma.user.update({
    where: { id: user.id },
    data: { last_seen_at: new Date().toISOString() }
  });
}

async function handleHeartbeat(socket: WebSocket, packet: GatewayHeartbeatPacket) {
  if (!socket.hb) return;

  socket.hb.reset();
  socket.hb.acknowledge(packet.d);
}

async function handlePresence(socket: WebSocket, packet: GatewayPresencePacket) {
  if (!socket.session || !socket.user_id) {
    return socket.close(4003, 'Not authenticated');
  }

  const allSessions = ctx.userSessions.get(socket.user_id);

  if (!allSessions?.length) return;

  const { d } = packet;
  const isLegacy = socket.client_build?.includes('2015');
  const gameField = isLegacy ? d.game_id : d.game;

  let setStatusTo = (!isLegacy && d.status) ? d.status.toLowerCase() : 'online';

  const isIdleRequested = isLegacy ? (d.idle_since != null || d.afk === true) : (d.since != 0 || d.afk === true);

  setStatusTo = isIdleRequested ? 'idle' : 'online';
  socket.session.last_idle = isIdleRequested ? Date.now() : 0;

  for (const session of allSessions) {
    if (session.id !== socket.session.id) {
      session.presence.status = setStatusTo;
      session.presence.game_id = gameField;
      session.last_idle = socket.session.last_idle;
    }
  }

  await socket.session.updatePresence(setStatusTo, gameField);
}

async function handleVoiceState(socket: WebSocket, packet: GatewayVoiceStatePacket) {
  const { guild_id, channel_id, self_mute, self_deaf } = packet.d;
  const { user_id, session } = socket;

  let current_guild = socket.current_guild_id;

  if (!session) {
    return socket.close(4003, 'Not authenticated');
  }

  if (!guild_id && !channel_id) {
    if (current_guild && user_id) {
      const voiceStates = ctx.guild_voice_states.get(current_guild) || [];
      const index = voiceStates.findIndex((x) => x.user_id === user_id);

      if (index !== -1) {
        voiceStates.splice(index, 1);
      }

      await dispatcher.dispatchEventInGuild(current_guild, 'VOICE_STATE_UPDATE', {
        channel_id: null,
        guild_id: current_guild,
        user_id: user_id,
        session_id: session.id,
        deaf: false,
        mute: false,
        self_deaf,
        self_mute,
        self_video: false,
        suppress: false,
      });

      socket.current_guild_id = null;
      socket.inCall = false;
    }
    return;
  }

  session.guild_id = guild_id ?? "0";
  session.channel_id = channel_id ?? "0";

  if (!current_guild) {
    current_guild = guild_id;
  }

  if (session.channel_id != "0" && current_guild) {
    const channel = await prisma.channel.findUnique({
      where: {
        id: socket.session.channel_id
      },
      select: {
        type: true,
        user_limit: true
      }
    });

    if (!channel || channel.type !== ChannelType.VOICE || !channel.user_limit) {
      return;
    }

    if (channel.user_limit > 0 && user_id) {
      const testRoom = ctx.rooms.filter((x) => x.room_id === `${guild_id}:${channel_id}`);
      const permissionCheck = await permissions.hasChannelPermissionTo(
        session.channel_id,
        current_guild,
        user_id,
        'MOVE_MEMBERS',
      );

      if (testRoom.length >= channel.user_limit && !permissionCheck) {
        return;
      } //to-do: work on moving members into the channel
    }
  }

  let room = ctx.rooms.find((x) => x.room_id === `${guild_id}:${channel_id}`);

  if (!room && guild_id) {
    ctx.rooms.push({
      room_id: `${guild_id}:${channel_id}`,
      participants: [],
    });

    ctx.guild_voice_states.set(guild_id, []);

    room = ctx.rooms.find((x) => x.room_id === `${guild_id}:${channel_id}`);
  }

  if (current_guild) {
    await dispatcher.dispatchEventInGuild(current_guild, 'VOICE_STATE_UPDATE', {
      channel_id: channel_id,
      guild_id: guild_id,
      user_id: user_id,
      session_id: socket.session.id,
      deaf: false,
      mute: false,
      self_deaf: self_deaf,
      self_mute: self_mute,
      self_video: false,
      suppress: false,
    });
  }

  if (room && user_id && guild_id && !room.participants.find((x) => x.user_id === user_id)) {
    room.participants.push({
      user_id: user_id,
      ssrc: globalUtils.generateString(30),
    });

    const voiceStates = ctx.guild_voice_states.get(guild_id);

    if (voiceStates && !voiceStates.find((y) => y.user_id === socket.user_id)) {
      voiceStates.push({
        user_id: user_id,
        session_id: socket.session.id,
        guild_id: guild_id,
        channel_id: channel_id,
        mute: false,
        deaf: false,
        self_deaf: self_deaf,
        self_mute: self_mute,
        self_video: false,
        suppress: false,
      });
    }
  }

  if (!socket.inCall && current_guild) {
    socket.session.dispatch('VOICE_SERVER_UPDATE', {
      token: globalUtils.generateString(30),
      guild_id: guild_id,
      channel_id: channel_id,
      endpoint: globalUtils.generateRTCServerURL(),
    });
    socket.inCall = true;
  }
}

async function getGuildMembersAndPresences(guild_id: string): Promise<{ members: Member[], presences: any[] }> {
  try {
    const guild = await prisma.guild.findUnique({
      where: { id: guild_id },
      select: {
        roles: { select: { role_id: true } }
      }
    });

    if (!guild) {
      return {
        members: [],
        presences: [],
      };
    }

    const memberRows = await prisma.member.findMany({
      where: { guild_id: guild_id },
      include: { user: true }
    });

    const members: Member[] = [];
    const presences: any[] = [];

    let offlineCount = 0;

    const validRoleIds = new Set(guild.roles.map(r => r.role_id));

    for (const row of memberRows) {
      if (!row.user) continue;

      const member_roles = ((row.roles as string[]) || []).filter(id => validRoleIds.has(id));
      const member = {
        user: globalUtils.miniUserObject(row.user as User),
        nick: row.nick,
        deaf: row.deaf,
        mute: row.mute,
        roles: member_roles,
        joined_at: row.joined_at,
        id: row.user.id
      };

      const sessions = ctx.userSessions?.get(row.user_id);

      let presence;

      if (sessions && sessions.length > 0) {
        presence = sessions[sessions.length - 1].presence;
      } else {
        presence = {
          status: 'offline',
          activities: [],
          user: member.user,
        };
      }

      const isOnline = ['online', 'idle', 'dnd'].includes(presence.status);

      if (isOnline) {
        members.push(member);
        presences.push(presence);
      } else if (offlineCount < 1000) {
        offlineCount++;
        members.push(member);
        presences.push(presence);
      }
    }

    return {
      members: members,
      presences: presences,
    };
  } catch (error) {
    logText(error, 'error');
    return { members: [], presences: [] };
  }
}

async function handleOp12GetGuildMembersAndPresences(socket: WebSocket, packet: GatewayLazyFetchPacket) {
  const { user_id, session } = socket;
  const requested_guild_ids = packet.d;

  if (!session || !requested_guild_ids.length) return;

  const valid_guilds = await prisma.guild.findMany({
    where: {
      id: { in: requested_guild_ids },
      members: {
        some: {
          user_id: user_id
        }
      }
    },
    select: {
      id: true
    }
  });

  const authorized_ids = valid_guilds.map(g => g.id);

  for (const guild_id of authorized_ids) {
    const op12 = await getGuildMembersAndPresences(guild_id);

    if (!op12) {
      continue;
    }

    socket.session.dispatch('GUILD_SYNC', {
      id: guild_id,
      presences: op12.presences,
      members: op12.members,
    });
  }
}

async function handleOp14GetGuildMemberChunks(socket: WebSocket, packet: GatewayMemberChunksPacket) {
  //This new rewritten code was mainly inspired by spacebar if you couldn't tell since their OP 14 is more stable than ours at the moment.
  //TO-DO: add support for shit like INSERT and whatnot (hell)

  await lazyRequest.fire(socket, packet);
}

async function handleResume(socket: WebSocket, packet: GatewayResumePacket) {
  const token = packet.d.token;
  const session_id = packet.d.session_id;

  if (!token || !session_id) {
    return socket.close(4000, 'Invalid payload');
  }

  if (socket.session || socket.resumed) {
    return socket.close(4005, 'Cannot resume at this time');
  }

  socket.resumed = true;

  const user = await prisma.user.findUnique({
    where: {
      token: token
    },
    select: {
      disabled_until: true,
      username: true,
      discriminator: true,
      avatar: true,
      premium: true,
      flags: true,
      id: true,
      bot: true,
      settings: true,
      email: true
    }
  })

  if (!user || user.disabled_until) {
    return socket.close(4004, 'Authentication failed');
  }

  const session2 = ctx.sessions.get(session_id);

  if (!session2) {
    const sesh = new session(
      globalUtils.generateString(16),
      socket,
      user,
      token,
      false,
      {
        game_id: null,
        status: (user?.settings as AccountSettings).status ?? 'online',
        activities: [],
        user: globalUtils.miniUserObject(user as User),
        roles: [],
      },
      "gateway",
      undefined,
      undefined,
      socket.apiVersion,
      packet.d.capabilities ?? socket.client_build_date,
    );

    sesh.seq = packet.d.seq;
    sesh.eventsBuffer = [];
    sesh.start();

    socket.session = sesh;
  }

  let sesh: Session | null = null; //to-do 

  if (!session2) {
    sesh = socket.session;
  } else sesh = session2;

  if (sesh.user.id !== socket.user_id) {
    return socket.close(4004, 'Authentication failed');
  }

  if (sesh.seq < packet.d.seq) {
    return socket.close(4007, 'Invalid seq');
  }

  if (sesh.eventsBuffer.find((x) => x.seq == packet.d.seq)) {
    socket.session = sesh;

     await prisma.user.update({
      where: { id: user.id },
      data: { last_seen_at: new Date().toISOString() }
    });

    return await socket.session.resume(sesh.seq, socket);
  } else {
    sesh.send({
      op: GatewayOpcode.INVALID_SESSION,
      d: false,
    });
  }
}

type GatewayHandler = (socket: WebSocket, packet: any) => Promise<void> | void;

const gatewayHandlers: Record<number, GatewayHandler> = {
  [GatewayOpcode.IDENTIFY]: handleIdentify,
  [GatewayOpcode.HEARTBEAT]: handleHeartbeat,
  [GatewayOpcode.PRESENCE_UPDATE]: handlePresence,
  [GatewayOpcode.VOICE_STATE_UPDATE]: handleVoiceState,
  [GatewayOpcode.LAZY_UPDATE]: handleOp12GetGuildMembersAndPresences,
  [GatewayOpcode.REQUEST_GUILD_MEMBERS]: handleOp14GetGuildMemberChunks,
  [GatewayOpcode.RESUME]: handleResume,
};

export { gatewayHandlers };