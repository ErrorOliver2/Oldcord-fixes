import { prisma } from '../../prisma.ts';
import globalUtils, { generateString, generateToken } from '../../helpers/globalutils.ts';
import errors from '../../helpers/errors.ts';
import { genSalt, hash } from 'bcrypt';
import { generate } from '../../helpers/snowflake.ts';
import { GuildService } from './guildService.ts';
import { logText } from '../../helpers/logger.ts';
import type { User } from '../../types/user.ts';
import type { Bot } from '../../types/bot.ts';

export const OAuthService = {
    async createApplication(ownerId: string, name: string) {
        return prisma.application.create({
            data: {
                id: generate(),
                owner_id: ownerId,
                name: name,
                secret: generateString(20),
                description: ''
            }
        });
    },
    
    async deleteApplication(applicationId: string) {
        await prisma.$transaction([
            prisma.bot.delete({ where: { id: applicationId } }),
            prisma.application.delete({ where: { id: applicationId } })
        ]);
    },

    formatApplication(app: any) {
        if (app.bot) {
            const { public: is_public, require_code_grant, ...botData } = app.bot;

            return {
                ...app,
                bot: botData,
                bot_public: is_public,
                bot_require_code_grant: require_code_grant
            };
        }
        return app;
    },

    async createBot(application: any) {
        const salt = await genSalt(10);
        const pwHash = await hash(generateString(30), salt);
        const discriminator = Math.floor(1000 + Math.random() * 9000).toString();
        const token = generateToken(application.id, pwHash);

        return prisma.bot.create({
            data: {
                id: application.id,
                application_id: application.id,
                username: application.name,
                discriminator,
                token
            }
        });
    },

    async getOAuthDetails(clientId: string, scope: string, account: any, isStaff: boolean, staffPrivilege: number) {
        const dbApplication = await prisma.application.findUnique({
            where: { id: clientId },
            include: { bot: true }
        });

        if (!dbApplication) {
            throw { status: 404, error: errors.response_404.UNKNOWN_APPLICATION };
        }

        const application: any = {
            ...dbApplication,
            redirect_uris: [],
            rpc_application_state: 0,
            rpc_origins: []
        };

        if (scope.includes('bot')) {
            const bot = dbApplication.bot;

            if (!bot) throw { status: 404, error: errors.response_404.UNKNOWN_APPLICATION };

            if (!bot.public && dbApplication.owner_id !== account.id) {
                throw { status: 404, error: errors.response_404.UNKNOWN_APPLICATION };
            }

            const { public: is_public, require_code_grant, token, ...botData } = bot;

            application.bot = botData;
            application.bot_public = is_public;
            application.bot_require_code_grant = require_code_grant;
        }

        const guilds = await prisma.guild.findMany({
            where: {
                members: { some: { user_id: account.id } }
            },
            include: {
                members: { where: { user_id: account.id } }
            }
        });

        const authorizedGuilds = guilds.filter(guild => {
            const isOwner = guild.owner_id === account.id;
            const isStaffOverride = isStaff && staffPrivilege >= 3;
            
            return isOwner || isStaffOverride || permissions.hasGuildPermissionTo(guild, account.id, 'ADMINISTRATOR', null) || permissions.hasGuildPermissionTo(guild, account.id, 'MANAGE_GUILD', null);
        }).map(guild => ({
            id: guild.id,
            icon: guild.icon,
            name: guild.name,
            permissions: 2146958719,
            region: null,
        }));

        return {
            authorized: false,
            application,
            bot: application.bot || null,
            user: globalUtils.miniUserObject(account),
            guilds: authorizedGuilds,
            redirect_uri: null
        };
    },

    async authorizeBotToGuild(clientId: string, guildId: string, userId: string) {
        const application = await prisma.application.findUnique({
            where: { id: clientId },
            include: { bot: true }
        });

        if (!application || !application.bot) {
            throw {
                status: 404,
                error: errors.response_404.UNKNOWN_APPLICATION
            };
        }

        const canJoinGuild = await GuildService.canJoin(application.bot.id, guildId);

        if (!canJoinGuild.canJoin) {
            throw { status: 404, error: errors.response_404.UNKNOWN_GUILD };
        }

        const guild = await prisma.guild.findUnique({
            where: { id: guildId },
            include: {
                members: { where: { OR: [{ user_id: userId }, { user_id: application.bot.id }] } },
                bans: { where: { user_id: application.bot.id } }
            }
        });

        if (!guild) {
            throw { status: 404, error: errors.response_404.UNKNOWN_GUILD };
        }

        const authorizingUser = guild.members.find(m => m.user_id === userId);
        const botAlreadyThere = guild.members.find(m => m.user_id === application.bot!.id);

        if (!authorizingUser || botAlreadyThere || guild.bans.length > 0) {
            throw { status: 403, error: errors.response_403.MISSING_PERMISSIONS };
        }

        const hasPermission = guild.owner_id === userId || permissions.hasGuildPermissionTo(guild, userId, 'MANAGE_GUILD', null);

        if (!hasPermission) {
            throw { status: 403, error: errors.response_403.MISSING_PERMISSIONS };
        } //redundant checks but remove later

        await GuildService.addMember({
            id: application.bot.id,
            username: application.bot.username,
            avatar: application.bot.avatar,
            discriminator: application.bot.discriminator,
            bot: true
        } as Bot, guild.id);

        return { success: true };
    },

    async getApplicationById(applicationId: string) {
        try {
            const app = await prisma.application.findUnique({
                where: { id: applicationId },
                include: {
                    owner: true,
                    bot: true
                }
            });

            if (!app || !app.owner) {
                return null;
            }

            return {
                id: app.id,
                name: app.name ?? 'My Application',
                icon: app.icon,
                description: app.description ?? '',
                redirect_uris: [],
                rpc_application_state: 0,
                rpc_origins: [],
                secret: app.secret,
                owner: globalUtils.miniUserObject(app.owner as User),
            };
        } catch (error) {
            logText(error, 'error');

            return null;
        }
    },
};