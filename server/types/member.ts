import type { User } from "./user.ts";

export interface Member {
  user: User;
  nick: string | null;
  roles: string[];
  joined_at: string;
  deaf: boolean;
  mute: boolean;
}