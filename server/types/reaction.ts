import type { Emoji } from "./emoji.ts";

export interface DiscordReaction2018 {
  count: number;
  me: boolean;
  emoji: Partial<Emoji>;
}