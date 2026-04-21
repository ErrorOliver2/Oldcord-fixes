import type { User } from "./user.ts";

export enum RelationshipType {
  NONE = 0,
  FRIEND = 1,
  BLOCKED = 2,
  INCOMING_FR = 3,
  OUTGOING_FR = 4
};

export interface Relationship {
    id: string;
    type: RelationshipType;
    user: User;
}