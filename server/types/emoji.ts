import type { User } from "./user.ts";

export interface Emoji {
  id: string | null;
  name: string;
  roles?: string[];
  user?: User;
  require_colons?: boolean;
  managed?: boolean;
  animated?: boolean;
}