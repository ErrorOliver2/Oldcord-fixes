import { RelationshipType, type Relationship } from "../../types/relationship.ts";
import { prisma } from "../../prisma.ts";
import globalUtils from "../../helpers/globalutils.ts";
import { logText } from "../../helpers/logger.ts";
import type { User } from "../../types/user.ts";
import { GuildService } from "./guildService.ts";
import type { Account } from "../../types/account.ts";
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

                if (isInitiator && type === 3) {
                    type = 4;
                }

                if (type === 2 && !isInitiator) {
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
            if (type === 0) {
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

    async handleFriendRequest(account: Account, target: Account) {
        const rel = account.relationships?.find((r) => r.id === target.id);
        const targetRel = target.relationships?.find((r) => r.id === account.id);

        if ((rel && rel.type !== RelationshipType.NONE) || (targetRel && targetRel.type === RelationshipType.BLOCKED)) {
            throw { status: 403, message: 'Failed to send friend request' };
        }

        const flags = target.settings?.friend_source_flags;

        if (flags && !flags.all) {
            let authorized = false;
            
            if (flags.mutual_guilds) {
                const mutual = await GuildService.getMutualGuilds(account.id, target.id);

                if (mutual.length > 0) {
                    authorized = true;
                }
            }

            if (!authorized && flags.mutual_friends) {
                const sharedFriends = account.relationships?.filter((r) => 
                    r.type === RelationshipType.FRIEND && target.relationships?.some((tr) => tr.id === r.id && tr.type === RelationshipType.FRIEND)
                );

                if (sharedFriends && sharedFriends.length > 0) {
                    authorized = true;
                }
            }

            if (!authorized) {
                throw { status: 403, message: 'Failed to send friend request' };
            }
        }

        await this.addRelationship(account.id, target.id, RelationshipType.INCOMING_FR);
        
        await dispatcher.dispatchEventTo(account.id, 'RELATIONSHIP_ADD', {
            id: target.id, type: RelationshipType.OUTGOING_FR, user: globalUtils.miniUserObject(target)
        });

        await dispatcher.dispatchEventTo(target.id, 'RELATIONSHIP_ADD', {
            id: account.id, type: RelationshipType.INCOMING_FR, user: globalUtils.miniUserObject(account)
        });
    }
};