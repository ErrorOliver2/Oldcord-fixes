export interface StaffAuditLogEntry {
    moderation_id: string;
    timestamp: string;
    action: string;
    moderated: {
        id: string;
        until_forever: boolean;
        until_when: string;
    };
    reasoning: string;
};

export enum StaffPrivilegeLevel {
    JANITOR = 1,
    MODERATOR = 2,
    ADMIN = 3,
    OWNER = 4
}; //PRIVILEGE: 1 - (JANITOR) [Can only flag things for review], 2 - (MODERATOR) [Can only delete messages, mute users, and flag things for review], 3 - (ADMIN) [Free reign, can review flags, disable users, delete servers, etc], 4 - (INSTANCE OWNER) - [Can add new admins, manage staff, etc]

export interface StaffDetails {
    audit_log: StaffAuditLogEntry[];
    privilege: number;
    user_id: string;
};