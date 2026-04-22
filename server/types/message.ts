import type { Reaction } from "./reaction.ts";
import type { User } from "./user.ts";

export enum MessageType {
  DEFAULT = 0,
  ADD_TO_GROUP = 1,
  REMOVE_FROM_GROUP = 2,
  CALL = 3,
  CHANNEL_NAME_CHANGE = 4,
  CHANNEL_ICON_CHANGE = 5,
  PIN = 6,
  GUILD_MEMBER_JOIN = 7,
  GUILD_SUBSCRIPTION = 8,
  GUILD_SUBSCRIPTION_TIER_1 = 9,
  GUILD_SUBSCRIPTION_TIER_2 = 10,
  GUILD_SUBSCRIPTION_TIER_3 = 11,
};

export interface Message {
  id: string;
  channel_id: string;
  guild_id?: string;
  author: User;
  content: string;
  timestamp: string;
  edited_timestamp: string | null;
  tts: boolean;
  mention_everyone: boolean;
  mentions: any[];
  mention_roles: string[];
  attachments: any[];
  embeds: any[];
  reactions?: Reaction[];
  nonce?: string | number;
  pinned: boolean;
  webhook_id?: string;
  type: MessageType;
}