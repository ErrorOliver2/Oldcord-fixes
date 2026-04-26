import type { User } from "./user.ts";

export interface Game {
    name: string;
    type: number;
    url?: string | null;
    timestamps?: {
        start?: number;
        end?: number;
    };
    details?: string;
    state?: string;
    application_id?: string;
    assets?: {
        large_image?: string;
        large_text?: string;
        small_image?: string;
        small_text?: string;
    };
}

export interface Activity extends Game {}

export type StatusType = "online" | "dnd" | "idle" | "invisible" | "offline";

export interface Presence {
    user: Partial<User> & { id: string };
    guild_id?: string | null;
    status: StatusType;
    game: Game | null; //2015 clients used game_id here which is the game's name if any or null
    activities: Activity[];
    idle_since?: number | null;
    afk?: boolean;
};