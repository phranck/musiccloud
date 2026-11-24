import type { AdminUserResponse } from "@musiccloud/shared";

export interface AdminStats {
  tracks: number;
  albums: number;
  artists: number;
  artistProfiles?: number;
  artistEntities?: number;
  users: number;
}

export interface AdminSetup {
  username: string;
  password: string;
}

export interface AdminLogin {
  username: string;
  password: string;
}

/**
 * The answer to inviting a dashboard user.
 *
 * @property user - The new user, who has not signed in yet.
 * @property inviteUrl - The single-use address where the invitee sets a password.
 */
export interface AdminUserInvite {
  user: AdminUserResponse;
  inviteUrl: string;
}

export interface AdminInviteState {
  username: string;
  email: string;
}
