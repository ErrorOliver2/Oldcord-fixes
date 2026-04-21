import { prisma } from "../../prisma.ts";
import { logText } from "../../helpers/logger.ts";

export const DatabaseService = {
    setup: async () => {
        try {
            const defaultId = '643945264868098049';

            await prisma.user.upsert({
                where: {
                     id: defaultId
                },
                update: {},
                create: {
                    id: defaultId,
                    username: 'Oldcord',
                    discriminator: '0000',
                    email: 'system@oldcordapp.com',
                    password: '........................................',
                    bot: true,
                    flags: 4096,
                    created_at: new Date().toISOString(),
                }
            });

            await prisma.guild.upsert({
                where: { 
                    id: defaultId
                },
                update: {},
                create: {
                    id: defaultId,
                    name: 'Oldcord Official',
                    owner_id: defaultId,
                    creation_date: new Date().toISOString(),
                }
            });

            await prisma.channel.upsert({
                where: { 
                    id: defaultId
                },
                update: {},
                create: {
                    id: defaultId,
                    type: 0,
                    guild_id: defaultId,
                    name: 'please-read-me',
                    position: 0,
                    topic: '[OVERRIDENTOPIC]',
                }
            });

            await prisma.message.upsert({
                where: { 
                    message_id: defaultId 
                },
                update: {},
                create: {
                    message_id: defaultId,
                    type: 0,
                    guild_id: defaultId,
                    channel_id: defaultId,
                    author_id: defaultId,
                    content: `Hey! It looks like you're using a client build that isn't supported by this guild. Your current build is from [YEAR] (if this shows the current year, you are either running a third party client or mobile client). Please check the channel topic or guild name for more details.`,
                    edited_timestamp: null,
                    mention_everyone: false,
                    nonce: defaultId,
                    timestamp: new Date().toISOString(),
                    tts: false,
                    embeds: "[]",
                }
            });

            return true;
        } catch (error) {
            console.error(error);
            logText(`Failed to setup Database!`, 'error');
            
            return false;
        }
    }
};

//npx prisma generate
//npx prisma db push