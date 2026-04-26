export enum AuditLogActionType {
    GUILD_UPDATE = 1, //DONE
    CHANNEL_CREATE = 10, //DONE
    CHANNEL_UPDATE = 11, //DONE
    CHANNEL_DELETE = 12, //DONE
    CHANNEL_OVERWRITE_CREATE = 13, //DONE
    CHANNEL_OVERWRITE_UPDATE = 14, //DONE
    CHANNEL_OVERWRITE_DELETE = 15, //DONE
    MEMBER_KICK = 20, //DONE
    MEMBER_PRUNE = 21, //TO-DO AS WE STILL NEED TO IMPLEMENT PRUNING
    MEMBER_BAN_ADD = 22, //DONE
    MEMBER_BAN_REMOVE = 23, //DONE
    MEMBER_UPDATE = 24, //DONE
    MEMBER_ROLE_UPDATE = 25, //DONE
    MEMBER_MOVE = 26, //TO-DO ON VOICE STATE AS WE STILL NEED TO IMPLEMENT MOVING MEMBERS
    MEMBER_DISCONNECT = 27, //TO-DO ON VOICE STATE AS WE STILL NEED TO IMPLEMENT KICKING MEMBERS FROM THE VOICE CHANNEL
    BOT_ADD = 28, //DONE
    ROLE_CREATE = 30, //DONE
    ROLE_UPDATE = 31, //DONE
    ROLE_DELETE = 32, //DONE
    INVITE_CREATE = 40, //DONE
    INVITE_DELETE = 42, //DONE
    WEBHOOK_CREATE = 50, //DONE
    WEBHOOK_UPDATE = 51, //DONE
    WEBHOOK_DELETE = 52, //DONE
    EMOJI_CREATE = 60, //DONE
    EMOJI_UPDATE = 61, //DONE
    EMOJI_DELETE = 62, //DONE
    MESSAGE_DELETE = 72, //DONE
    MESSAGE_BULK_DELETE = 73, //DONE
    MESSAGE_PIN = 74, //DONE
    MESSAGE_UNPIN = 75, //DONE
    INTEGRATION_CREATE = 80, //TO-DO ON GUILDS WHEN OAUTH2 APPLICATIONS ARE LINKED TO A GUILD
    INTEGRATION_UPDATE = 81, //TO-DO ON GUILDS WHEN OAUTH2 APPLICATIONS ARE UPDATED ON A GUILD
    INTEGRATION_DELETE = 82 //TO-DO ON GUILDS WHEN OAUTH2 APPLICATIONS ARE REMOVED FROM A GUILD
}

export interface AuditLogEntry {
    id: string;
    target_id?: string;
    user_id?: string;
    action_type: AuditLogActionType;
    reason: string | null;
    changes?: AuditLogChange[];
    options?: AuditLogOptions;
}

export interface AuditLogChange {
  key: any;
  new_value?: any;
  old_value?: any;
}

/* (key field related)
    Audit Log Change Exceptions
    Object Changed	Change Key Exceptions	Change Object Exceptions
    Invite and Invite Metadata	Additional channel_id key (instead of object’s channel.id)	- DONE
    Partial Role	$add and $remove as keys	new_value is an array of objects that contain the role id and name - DONE
    Webhook	avatar_hash key (instead of avatar)	- DONE
*/

export interface AuditLogOptions {
  delete_member_days?: string; //delete_member_days	string	Number of days after which inactive members were kicked	MEMBER_PRUNE - TODO
  members_removed?: string; //members_removed	string	Number of members removed by the prune	MEMBER_PRUNE - TODO
  channel_id?: string; //channel_id	snowflake	Channel in which the entities were targeted	MEMBER_MOVE & MESSAGE_PIN & MESSAGE_UNPIN & MESSAGE_DELETE - DONE ON MESSAGE_PIN AND UNPIN
  count?: string; //Number of entities that were targeted	MESSAGE_DELETE & MESSAGE_BULK_DELETE & MEMBER_DISCONNECT & MEMBER_MOVE - DONE ON MESSAGE_DELETE AND MESSAGE_BULK_DELETE
  id?: string; //id	snowflake	ID of the overwritten entity	CHANNEL_OVERWRITE_CREATE & CHANNEL_OVERWRITE_UPDATE & CHANNEL_OVERWRITE_DELETE - DONE
  type?: string; //type	string	Type of overwritten entity - role ("0") or member ("1")	CHANNEL_OVERWRITE_CREATE & CHANNEL_OVERWRITE_UPDATE & CHANNEL_OVERWRITE_DELETE - DONE
  role_name?: string; //role_name	string	Name of the role if type is "0" (not present if type is "1")	CHANNEL_OVERWRITE_CREATE & CHANNEL_OVERWRITE_UPDATE & CHANNEL_OVERWRITE_DELETE - DONE
}