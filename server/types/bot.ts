export interface Bot {
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
    bot: boolean;
    webhook?: boolean;
    token?: string;
    application_id?: string;
    public?: boolean | null;
    require_code_grant?: boolean | null;
};