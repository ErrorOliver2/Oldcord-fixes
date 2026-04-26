import type { Guild } from "./guild.ts";
import type { User } from "./user.ts";
import type { WebSocket } from "ws";

export interface Session {
    id: string;
    socket: WebSocket;
    token: string;
    user: User;
    seq: number;
    time: number;
    ready: boolean;
    presence: any;
    type: 'gateway' | 'voice'; //or voice
    dead: boolean;
    lastMessage: number
    ratelimited: boolean;
    last_idle: number;
    channel_id: string;
    guild_id: string;
    eventsBuffer: any[];
    unavailable_guilds: Guild[];
    presences: any[];
    read_states: any[];
    subscriptions: any;
    memberListCache: any;
    guildCache: Guild[];
    apiVersion: number;
    capabilities: Date | null;
    application: any;

    onClose(code: number): void;
    updatePresence(status: string, game_id?: any, save_presence?: boolean, bypass_check?: boolean): Promise<void>;
    dispatch(type: string, payload: any): Promise<void>;
    dispatchPresenceUpdate(presenceOverride?: any): Promise<void>;
    dispatchSelfUpdate(): Promise<void>;
    terminate(): Promise<void>;
    send(payload: any): void;
    start(): void;
    readyUp(body: any): Promise<void>;
    resume(seq: number, socket: any): Promise<void>;
    prepareReady(): Promise<void>;
}