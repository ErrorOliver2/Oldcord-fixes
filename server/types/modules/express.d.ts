import { Request } from 'express';
import type { RateLimitRequestHandler } from 'express-rate-limit';
import type { Account } from '../account.ts';
import type { User } from '../user.ts';
import type { Channel } from '../channel.ts';
import type { Message } from '../message.ts';
import type { Guild } from '../guild.ts';
import type { StaffDetails } from '../staff.ts';
import type { Member } from '../member.ts';
import type { Role } from '../role.ts';
import type { Invite } from '../invite.ts';
import type { Webhook } from '../webhook.ts';

declare global {
  namespace Express {
    interface Request {
      client_build: string;
      account?: Account | null;
      member?: Member | null;
      role?: Role | null;
      application?: any;
      fingerprint?: string;
      is_staff?: boolean;
      apiVersion?: number;
      rateLimit?: any;
      subscription?: any;
      invite?: Invite;
      client_build_date?: Date;
      staff_details?: StaffDetails; 
      user_staff_details?: StaffDetails;
      channel_types_are_ints?: boolean;
      cannot_pass?: boolean;
      files?: any[];
      is_staff?: boolean;
      is_user_staff?: boolean;
      guild?: Guild | null;
      recipient?: User | null;
      user?: Account | null; //Would use User here but Accounts have relationships attached to them, which we may need in further logic.
      channel?: Channel | null;
      webhook?: Webhook | null;
      message?: Message | null;
      plural_recipients: User[];
    }
    interface Response {
      json: (body: any) => Response; 
    }
  }
}
