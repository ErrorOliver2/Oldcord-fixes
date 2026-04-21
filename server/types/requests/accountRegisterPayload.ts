export interface AccountRegisterPayload {
    email: string;
    username: string;
    password: string;
    invite?: string;
};