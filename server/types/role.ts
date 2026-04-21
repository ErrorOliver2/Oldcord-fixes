export interface Role {
  id: string;
  guild_id?: string;
  name: string;
  color: number;
  hoist: boolean;
  position: number;
  permissions: number;
  managed?: boolean;
  mentionable?: boolean;
}