import type { User } from "./user.ts";

export interface WebhookOverride {
    username: string | null;
    avatar_url: string | null;
}

export interface Webhook {
    id: string;
    guild_id: string;
    channel_id: string;
    token?: string;
    avatar?: string | null;
    name?: string;
    user?: User;
    type: number;
    application_id?: string | null;
}