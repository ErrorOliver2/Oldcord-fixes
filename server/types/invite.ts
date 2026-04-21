import type { Channel } from "./channel.ts";
import type { Guild } from "./guild.ts";
import type { User } from "./user.ts";

export interface Invite {
    code: string;
    temporary?: boolean;
    revoked?: boolean; //To-do: is this necessary anymore?
    inviter?: User | null; //Always a public user
    max_age: number;
    max_uses: number;
    uses?: number;
    created_at?: string;
    guild?: Guild | null;
    channel?: Channel | null; //Or null apparently?
};