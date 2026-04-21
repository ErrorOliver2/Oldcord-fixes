import { RelationshipType, type Relationship } from "../../types/relationship.ts";
import { prisma } from "../../prisma.ts";
import globalUtils from "../../helpers/globalutils.ts";
import { logText } from "../../helpers/logger.ts";
import type { User } from "../../types/user.ts";
import { GuildService } from "./guildService.ts";
import type { AccountSettings } from "../../types/account.ts";
import dispatcher from "../../helpers/dispatcher.ts";

export const RelationshipService = {
    async getRelationshipsByUserId(userId: string): Promise<Relationship[]> {
        try {
            const relationships = await prisma.relationship.findMany({
                where: {
                    OR: [
                        { user_id_1: userId },
                        { user_id_2: userId }
                    ]
                },
                include: {
                    sender: true,
                    receiver: true
                }
            });

            const result: Relationship[] = [];

            for (const rel of relationships) {
                const isInitiator = rel.user_id_1 === userId;
                const otherUser = isInitiator ? rel.receiver : rel.sender;
                
                let type = rel.type;

                if (isInitiator && type === RelationshipType.INCOMING_FR) {
                    type = RelationshipType.OUTGOING_FR;
                }

                if (type === RelationshipType.BLOCKED && !isInitiator) {
                    continue;
                }

                result.push({
                    id: otherUser.id,
                    type: type,
                    user: globalUtils.miniUserObject(otherUser as User)
                });
            }

            return result;
        } catch (error) {
            logText(error, 'error');
            return [];
        }
    },

    async modifyRelationship(userId: string, targetId: string, type: number): Promise<boolean> {
        try {
            if (type === RelationshipType.NONE) {
                await prisma.relationship.deleteMany({
                    where: {
                        OR: [
                            { user_id_1: userId, user_id_2: targetId },
                            { user_id_1: targetId, user_id_2: userId }
                        ]
                    }
                });
            } else {
                await prisma.relationship.updateMany({
                    where: {
                        OR: [
                            { user_id_1: userId, user_id_2: targetId },
                            { user_id_1: targetId, user_id_2: userId }
                        ]
                    },
                    data: { type: type }
                });
            }
            return true;
        } catch (error) {
            logText(error, 'error');
            return false;
        }
    },

    async addRelationship(initiatorId: string, targetId: string, type: number): Promise<boolean> {
        try {
            await prisma.relationship.create({
                data: {
                    user_id_1: initiatorId,
                    user_id_2: targetId,
                    type: type
                }
            });
            return true;
        } catch (error) {
            logText(error, 'error');
            return false;
        }
    },

    async handleFriendRequest(accountId: string, targetId: string) {
        const [account, target, existingRel] = await Promise.all([
            prisma.user.findUnique({
                where: { id: accountId },
                select: { id: true, username: true, discriminator: true, avatar: true, settings: true }
            }),
            prisma.user.findUnique({
                where: { id: targetId },
                select: { id: true, settings: true, username: true, discriminator: true, avatar: true },
            }),
            prisma.relationship.findFirst({
                where: {
                    OR: [
                        { user_id_1: accountId, user_id_2: targetId },
                        { user_id_1: targetId, user_id_2: accountId }
                    ]
                }
            })
        ]);

        if (!account || !target) {
            throw { status: 404, message: 'User not found' };
        }

        if (existingRel && existingRel.type !== RelationshipType.NONE) {
            throw { status: 403, message: 'Failed to send friend request' };
        }

        const targetSettings = target.settings as AccountSettings;
        const flags = targetSettings?.friend_source_flags;

        if (flags && !flags.all) {
            let authorized = false;
        
            if (flags.mutual_guilds) {
                const mutual = await GuildService.getMutualGuilds(accountId, targetId);

                if (mutual.length > 0) {
                    authorized = true;
                }
            }

            if (!authorized && flags.mutual_friends) {
                const sharedFriendsCount = await prisma.relationship.count({
                    where: {
                        type: RelationshipType.FRIEND,
                        user_id_1: accountId,
                        user_id_2: {
                            in: await prisma.relationship.findMany({
                                where: { user_id_1: targetId, type: RelationshipType.FRIEND },
                                select: { user_id_2: true }
                            }).then(rels => rels.map(r => r.user_id_2))
                        }
                    }
                });

                if (sharedFriendsCount > 0) {
                    authorized = true;
                }
            }

            if (!authorized) {
                throw { status: 403, message: 'Failed to send friend request' };
            }
        }

        await this.addRelationship(accountId, targetId, RelationshipType.INCOMING_FR);

        const miniAccount = globalUtils.miniUserObject(account as any);
        const miniTarget = globalUtils.miniUserObject(target as any);

        await Promise.all([
            dispatcher.dispatchEventTo(accountId, 'RELATIONSHIP_ADD', {
                id: target.id, type: RelationshipType.OUTGOING_FR, user: miniTarget
            }),
            dispatcher.dispatchEventTo(targetId, 'RELATIONSHIP_ADD', {
                id: account.id, type: RelationshipType.INCOMING_FR, user: miniAccount
            })
        ]);
    }
};