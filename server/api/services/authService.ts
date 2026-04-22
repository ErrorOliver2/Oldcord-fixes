import { generate } from "../../helpers/snowflake.ts";
import errors from "../../helpers/errors.ts";
import { prisma } from "../../prisma.ts";
import { compareSync, genSalt, hash } from "bcrypt";
import { generateString, generateToken, config } from "../../helpers/globalutils.ts";
import { GuildService } from "./guildService.ts";
import { InviteService } from "./inviteService.ts";
import type { AccountRegisterPayload } from "../../types/requests/accountRegisterPayload.ts";
import type { User } from "../../types/user.ts";
import type { LoginSuccessResponse } from "../../types/responses/loginSuccessResponse.ts";
import type { LoginMFARequiredResponse } from "../../types/responses/loginMFARequiredResponse.ts";
import type { StaffDetails } from "../../types/staff.ts";
import { logText } from "../../helpers/logger.ts";
import ctx from "../../context.ts";

export const AuthService = {
    async register(data: AccountRegisterPayload): Promise<string | null> {
        try {
            const existingEmail = await prisma.user.findUnique({
                where: { email: data.email }
            });

            if (existingEmail) {
                throw {
                    status: 400,
                    message: { email: 'Email is already in use.' }
                };
            }

            const userCount = await prisma.user.count({ where: { username: data.username } });

            if (userCount >= 9999) {
                throw {
                    status: 400,
                    error: errors.response_400.TOO_MANY_USERS
                }
            }

            const id = generate();
            const salt = await genSalt(10);
            const pwHash = await hash(data.password || generateString(20), salt);
            const emailToken = config.email_config.enabled ? generateString(60) : null;
            const discriminator = Math.floor(1000 + Math.random() * 9000).toString();

            const newUser = await prisma.user.create({
                data: {
                    id,
                    username: data.username,
                    discriminator,
                    email: data.email,
                    password: data.password ? pwHash : null,
                    token: generateToken(id, pwHash),
                    created_at: new Date().toISOString(),
                    verified: !config.email_config.enabled,
                    email_token: emailToken,
                    settings: {
                        show_current_game: false,
                        inline_attachment_media: true,
                        inline_embed_media: true,
                        render_embeds: true,
                        render_reactions: true,
                        sync: true,
                        theme: "dark",
                        enable_tts_command: true,
                        message_display_compact: false,
                        locale: "en-US",
                        convert_emoticons: true,
                        restricted_guilds: [],
                        allow_email_friend_request: false,
                        friend_source_flags: { all: true },
                        developer_mode: true,
                        guild_positions: [],
                        detect_platform_accounts: false,
                        status: "online"
                    }
                }
            });

            if (emailToken) {
                await ctx.emailer?.sendRegistrationEmail(data.email, emailToken, newUser as User);
            }

            if (data.invite) {
                await InviteService.useInvite(data.invite, newUser.id);
            }

            const autoJoinGuild = config.instance.flags.filter((x) =>
                x.toLowerCase().includes('autojoin:'),
            );

            if (autoJoinGuild.length > 0) {
                let guildId = autoJoinGuild[0].split(':')[1];

                await GuildService.addMember(newUser.id, guildId);
            }

            return newUser.token;
        }
        catch (error) {
            logText(error, 'error');
            return null;
        }
    },

    async login(data: any, referer?: string): Promise<LoginSuccessResponse | LoginMFARequiredResponse> {
        const email = data.login || data.email;

        if (!email || !data.password) {
            throw { status: 400, message: { code: 400, email: !email ? 'Field required' : undefined, password: !data.password ? 'Field required' : undefined } };
        }

        const user = await prisma.user.findUnique({
            where: { email },
            include: { staff: true }
        });

        if (!user || !user.password || !compareSync(data.password, user.password)) {
            throw {
                status: 400,
                message: { code: 400, email: 'Email and/or password is invalid.', password: 'Email and/or password is invalid.' }
            };
        }

        if (user.disabled_until != null) {
            throw { status: 400, message: { code: 400, email: 'This account has been disabled.' } };
        }

        if (referer && referer.includes('redirect_to=%2Fadmin')) {
            if (!user.staff) {
                console.log(
                    `[${user.id}] ${user.username}#${user.discriminator} just tried to login to the Oldcord instance staff admin panel without permission. Further investigation necessary.`,
                );

                throw {
                    status: 400,
                    message: { code: 400, email: 'This account is not instance staff. This incident has been logged.' }
                };
            }
        }

        if (user.mfa_enabled && user.mfa_secret) {
            const mfaTicket = generateString(40);

            await prisma.mfaLoginTicket.create({
                data: {
                    user_id: user.id,
                    mfa_ticket: mfaTicket
                }
            });

            return { mfa: true, ticket: mfaTicket, sms: false };
        }

        return {
            token: user.token!!,
            settings: {},
            is_staff: !!user.staff,
            staff_details: user.staff ? (user.staff as unknown as StaffDetails) : null
        };
    }
};