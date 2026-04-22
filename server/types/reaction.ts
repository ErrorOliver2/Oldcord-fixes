import type { Emoji } from "./emoji.ts";

export interface Reaction {
  count?: number;
  me?: boolean;
  emoji: Partial<Emoji>;
  user_id?: string;
}