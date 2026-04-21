import { generate } from "../../helpers/snowflake.ts";
import { logText } from "../../helpers/logger.ts";
import { prisma } from "../../prisma.ts";
import { generateString } from "../../helpers/globalutils.ts";
import { UploadService } from "./uploadService.ts";
import type { Webhook } from "../../types/webhook.ts";

export const WebhookService = {
     _formatInternalWebhook(webhook: any): Webhook | null {
        if (!webhook) return null;

        return {
            guild_id: webhook.guild_id,
            channel_id: webhook.channel_id,
            id: webhook.id,
            token: webhook.token ?? undefined,
            avatar: webhook.avatar ?? null,
            name: webhook.name ?? undefined,
            user: webhook.creator ? {
                username: webhook.creator.username,
                discriminator: webhook.creator.discriminator,
                id: webhook.creator.id,
                avatar: webhook.creator.avatar,
                bot: false,
                premium: true,
            } : undefined,
            type: 1,
            application_id: null,
        };
    },

    async getWebhookById(id: string) {
        try {
            const webhook = await prisma.webhook.findUnique({
                where: { id },
                include: {
                    creator: true
                }
            });

            return this._formatInternalWebhook(webhook);
        }
        catch (error) {
           console.error(error);
           logText(error, `error`);
           return null;
        }
    },

    async createWebhook(guildId: string, user_id: string, channelId: string, name: string, avatarData?: string) {
        try {
            const webhookId = generate();
            const token = generateString(60);
            let avatarHash: string | null = null;

            if (avatarData && avatarData.includes('data:image/')) {
                avatarHash = UploadService.saveImage('avatars', webhookId, avatarData);
            }

            const webhook = await prisma.webhook.create({
                data: {
                    id: webhookId,
                    guild_id: guildId,
                    channel_id: channelId,
                    token: token,
                    name: name || "Captain Hook",
                    avatar: avatarHash,
                    creator_id: user_id
                },
                include: {
                    creator: true
                }
            });

            return this._formatInternalWebhook(webhook);
        } catch (error) {
            console.error(error);
            logText(error, 'error');
            return null;
        }
    },

    async updateWebhook(webhookId: string, channelId: string, name: string, avatarData?: string) {
        try {
            let finalAvatarValue = avatarData;

            if (avatarData && avatarData.includes('data:image/')) {
                finalAvatarValue = UploadService.saveImage('avatars', webhookId, avatarData);
            }

            const updatedWebhook = await prisma.webhook.update({
                where: { 
                    id: webhookId 
                },
                data: {
                    channel_id: channelId,
                    name: name,
                    avatar: finalAvatarValue
                },
                include: {
                    creator: true
                }
            });

            return this._formatInternalWebhook(updatedWebhook);
        } catch (error) {
            console.error(error);
            logText(error, 'error');
            return null;
        }
    },

    async deleteWebhook(webhookId: string): Promise<boolean> {
        try {
            await prisma.webhook.delete({
                where: {
                    id: webhookId
                }
            });

            return true;
        }
        catch (error) {
            console.error(error);
            logText(error, 'error');
            return false;
        }
    },

    async createWebhookOverride(webhookId: string, overrideId: string, username: string, avatar_url: string | null = null) {
        try {
            await prisma.webhookOverride.create({
                data: {
                    id: webhookId,
                    override_id: overrideId,
                    avatar_url: avatar_url,
                    username: username
                }
            });

            return true;
        }
        catch (error) {
            console.error(error);
            logText(error, 'error');
            return false;
        }
    }
};