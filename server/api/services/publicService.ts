import globalUtils from "../../helpers/globalutils.ts";

export const PublicService = {
    convertGuild (guild: any, userId?: string) {
        const memberEntry = userId 
            ? guild.members?.find((m: any) => m.user_id === userId) 
            : guild.members?.[0];

        return {
            id: guild.id,
            name: guild.name,
            icon: guild.icon,
            splash: guild.splash || null,
            banner: guild.banner || null,
            region: guild.region,
            owner_id: guild.owner_id,
            afk_channel_id: guild.afk_channel_id || null,
            afk_timeout: guild.afk_timeout ?? 300,
            features: guild.features || [],
            emojis: guild.custom_emojis || [],
            exclusions: guild.exclusions || [],
            roles: guild.roles || [],
            channels: guild.channels?.map((c: any) => ({
                ...c,
                permission_overwrites: c.permission_overwrites || [],
            })) || [],
            member_count: guild.members?.length || 0,
            members: guild.members?.map((m: any) => ({
                user: m.user ? globalUtils.miniUserObject(m.user) : undefined,
                nick: m.nick,
                roles: m.roles || [],
                joined_at: m.joined_at,
                deaf: m.deaf,
                mute: m.mute
            })) || [],
            presences: guild.members?.filter((m: any) => m.user).map((m: any) => 
                globalUtils.getUserPresence({ user: globalUtils.miniUserObject(m.user) })
            ) || [],      
            voice_states: global.guild_voice_states?.get(guild.id) || [],
            vanity_url_code: guild.vanity_url || null,
            creation_date: guild.creation_date,
            joined_at: memberEntry?.joined_at || new Date().toISOString(),
            verification_level: guild.verification_level ?? 0,
            default_message_notifications: guild.default_message_notifications ?? 0,
            explicit_content_filter: guild.explicit_content_filter ?? 0,
            system_channel_id: guild.system_channel_id || null,
            premium_tier: guild.premium_tier ?? 0,
            premium_subscription_count: guild.premium_subscription_count ?? 0,
            premium_progress_bar_enabled: guild.premium_progress_bar_enabled ?? false,
            large: (guild.members?.length || 0) > 250,
            unavailable: false,
        };
    }
};