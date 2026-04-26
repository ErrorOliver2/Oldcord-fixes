import type { Channel } from "./channel.ts";
import type { Emoji } from "./emoji.ts";
import type { Member } from "./member.ts";
import type { Presence } from "./presence.ts";
import type { Role } from "./role.ts";
import type { VoiceState } from "./voice.ts";
import type { Webhook } from "./webhook.ts";

export interface GuildSubscription {
    guild_id: string;
    user_id: string;
    id: string;
    ended: boolean;
};

export interface GuildRegion {
  id: string;
  name: string;
  optimal: boolean;
  deprecated: boolean;
  custom: boolean;
};

export enum GuildFeature {
  ANIMATED_ICON = 'ANIMATED_ICON',
  INVITE_SPLASH = 'INVITE_SPLASH',
  BANNER = 'BANNER',
  VANITY_URL = 'VANITY_URL'
};

export interface GuildWidget {
  channel_id: string;
  enabled: boolean;
};

export interface Guild {
  id: string;
  name?: string;
  icon?: string | null;
  splash?: string | null;
  banner?: string | null;
  owner_id?: string;
  region?: string;
  afk_channel_id?: string | null;
  afk_timeout?: number;
  embed_enabled?: boolean;
  embed_channel_id?: string | null;
  verification_level?: number;
  default_message_notifications?: number;
  explicit_content_filter?: number;
  roles?: Role[];
  audit_logs?: any[];
  emojis?: Emoji[];
  members?: Member[];
  exclusions?: any[];
  channels?: Channel[];
  vanity_url_code?: string | null;
  webhooks?: Webhook[];
  guild_scheduled_events?: any[];
  stage_instances?: any[];
  presences?: Presence[];
  properties?: any;
  large?: boolean;
  member_count?: number;
  features?: GuildFeature[] | string[]; //Ehh.. I guess it doesn't really matter but please use the Enum so you know what the fuck you're giving
  premium_subscription_count?: number;
  premium_progress_bar_enabled?: boolean;
  premium_tier?: number;
  voice_states?: VoiceState[];
  mfa_level?: number;
  application_id?: string | null;
  widget_enabled?: boolean;
  widget_channel_id?: string | null;
  system_channel_id?: string | null;
  unavailable?: boolean;
}