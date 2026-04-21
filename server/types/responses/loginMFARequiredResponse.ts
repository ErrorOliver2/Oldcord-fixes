export interface LoginMFARequiredResponse {
    mfa: boolean;
    ticket: string;
    sms: boolean;
};