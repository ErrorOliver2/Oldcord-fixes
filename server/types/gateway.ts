import * as z from 'zod';

// TODO: Add in all payloads

const heartbeatPayload = z.object({
  op: z.literal(1),
  d: z.number().nullable(),
  s: z.int().nullish(),
  t: z.string().nullish(),
});

const identifyPayload = z.object({
  op: z.literal(2),
  d: z.object({
    token: z.string(),
    properties: z.object({
      os: z.string(),
      browser: z.string(),
      device: z.string(),
    }),
    compress: z.boolean().optional(),
    large_threshold: z.number().min(50).max(250).optional(),
    shard: z.tuple([z.number(), z.number()]).optional(),
    intents: z.number().nullish(),
    presence: z.looseObject({}).optional(),
  }),
  s: z.int().nullish(),
  t: z.string().nullish(),
});

const resumePayload = z.object({
  op: z.literal(6),
  d: z.object({
    token: z.string(),
    session_id: z.string(),
    seq: z.number(),
  }),
  s: z.int().nullish(),
  t: z.string().nullish(),
});

const heartbeatInfoPayload = z.object({
  op: z.literal(10),
  d: z.object({
    heartbeat_interval: z.int(),
    _trace: z.array(z.string()),
  }),
  s: z.int().nullish(),
  t: z.string().nullish(),
});

export const GatewayPayloadSchema = z
  .discriminatedUnion('op', [
    heartbeatPayload,
    identifyPayload,
    resumePayload,
    heartbeatInfoPayload,
  ])
  .catch((ctx) => {
    return ctx.value as any;
  });

export type GatewayPayload = z.infer<typeof GatewayPayloadSchema>;

export enum GatewayOpcode {
  DISPATCH = 0,
  HEARTBEAT = 1,
  IDENTIFY = 2,
  PRESENCE_UPDATE = 3,
  VOICE_STATE_UPDATE = 4,
  RESUME = 6,
  RECONNECT = 7,
  REQUEST_GUILD_MEMBERS = 8,
  INVALID_SESSION = 9,
  HELLO = 10,
  HEARTBEAT_ACK = 11,
  LAZY_UPDATE = 12,
  GUILD_SUBSCRIPTIONS = 14,
}

export type GatewayIdentifyPacket = GatewayPacket<{
  token: string;
  properties: {
    $os: string;
    $browser: string;
    $device: string;
  };
  compress?: boolean;
  large_threshold?: number;
  shard?: [number, number];
  presence?: any;
  intents?: number;
}>;

export type GatewayHelloPacket = GatewayPacket<{
  heartbeat_interval: number;
}>;

export type GatewayHeartbeatPacket = GatewayPacket<number | null> & { op: GatewayOpcode.HEARTBEAT };
export type GatewayHeartbeatAck = GatewayPacket<number | null> & { op: GatewayOpcode.HEARTBEAT_ACK };

export type GatewayPresencePacket = GatewayPacket<{
  status: 'online' | 'dnd' | 'idle' | 'invisible' | 'offline';
  since: number | null;
  activities: any[];
  afk: boolean;
  game?: string | null;
  game_id?: string | null;
  idle_since?: number | null;
}>;

export type GatewayVoiceStatePacket = GatewayPacket<{
  guild_id: string | null;
  channel_id: string | null;
  self_mute: boolean;
  self_deaf: boolean;
  self_video?: boolean;
}>;

export type GatewayLazyFetchPacket = GatewayPacket<string[]>;

export type GatewayMemberChunksPacket = GatewayPacket<{
  guild_id: string;
  channels?: Record<string, [number, number][]>;
  typing?: boolean;
  threads?: boolean;
  activities?: boolean;
}>;

export type GatewayResumePacket = GatewayPacket<{
  token: string;
  session_id: string;
  seq: number;
}>;

export interface GatewayPacket<T = any> {
  op: GatewayOpcode;
  d: T;
  s?: number | null;
  t?: string | null;
}
