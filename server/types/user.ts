export interface User {
    id: string;
    username?: string;
    discriminator?: string;
    avatar?: string | null;
    bot?: boolean;
    webhook?: boolean;
    premium?: boolean;
};