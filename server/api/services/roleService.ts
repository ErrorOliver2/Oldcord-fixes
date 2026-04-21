import { prisma } from "../../prisma.ts";
import { logText } from "../../helpers/logger.ts";
import Snowflake from "../../helpers/snowflake.ts";
import type { Role } from "../../types/role.ts";

export const RoleService = {
    async createRole(guildId: string, name: string, position: number): Promise<Role | null> {
        try {
            const roleId = Snowflake.generate();
            const defaultPermissions = 73468929; // READ, SEND, MSG HISTORY, etc.

            const newRole = await prisma.role.create({
                data: {
                    role_id: roleId,
                    guild_id: guildId,
                    name: name,
                    permissions: defaultPermissions,
                    position: position,
                    color: 0,
                    hoist: false,
                    mentionable: false
                }
            });

            return {
                id: newRole.role_id,
                name: newRole.name,
                permissions: newRole.permissions,
                position: newRole.position,
                color: newRole.color,
                hoist: newRole.hoist,
                mentionable: newRole.mentionable,
            } as Role;
        } catch (error) {
            logText(error, 'error');
            return null;
        }
    },

    async updateRole(role_id: string, data: any) {
        try {
            const updated = await prisma.role.update({
                where: { role_id: role_id },
                data: {
                    name: data.name,
                    permissions: data.permissions,
                    position: data.position,
                    color: data.color,
                    hoist: data.hoist,
                    mentionable: data.mentionable
                }
            });

            return {
                id: updated.role_id,
                name: updated.name,
                permissions: updated.permissions,
                position: updated.position,
                color: updated.color,
                hoist: updated.hoist,
                mentionable: updated.mentionable,
            };
        } catch (error) {
            logText(error, 'error');
            return null;
        }
    },

    async deleteRole(roleId: string) {
        try {
            await prisma.role.delete({
                where: { role_id: roleId }
            });

            return true;
        } catch (error) {
            logText(error, 'error');
            return false;
        }
    },

    async getRolesByGuildId(guildId: string): Promise<Role[]> {
        try {
            const roles = await prisma.role.findMany({
                where: { guild_id: guildId },
                orderBy: { position: 'asc' }
            });

            return roles.map(role => ({
                id: role.role_id,
                name: role.name,
                permissions: role.permissions,
                position: role.position,
                color: role.color,
                hoist: role.hoist,
                mentionable: role.mentionable,
            } as Role));
        } catch (error) {
            logText(error, 'error');
            return [];
        }
    },

    async setRoles(guild_id: string, role_ids: string[], user_id: string): Promise<boolean> {
        try {
            if (!user_id || !guild_id) return false;

            const guildData = await prisma.guild.findUnique({
                where: { id: guild_id },
                select: {
                    roles: {
                        select: { role_id: true }
                    }
                }
            });
        
            if (!guildData) return false;

            const validRoleIds = new Set(guildData.roles.map(r => r.role_id));

            const saveRoles = role_ids.filter(id => 
                validRoleIds.has(id) && id !== guild_id
            );

            await prisma.member.update({
                where: {
                    guild_id_user_id: {
                        guild_id: guild_id,
                        user_id: user_id
                    }
                },
                data: {
                    roles: saveRoles
                }
            });

            return true;
        } catch (error) {
            logText(error, 'error');
            return false;
        }
    },
};