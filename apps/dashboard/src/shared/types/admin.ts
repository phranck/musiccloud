import type { AdminRole } from "../constants/domain";

export type { AdminRole };
export type AdminLocale = "de" | "en";

export interface AdminUser {
  id: string;
  username: string;
  email?: string;
  locale: AdminLocale;
  role: AdminRole;
  isOwner: boolean;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  sessionTimeoutMinutes?: number | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminStats {
  tracks: number;
  albums: number;
  artists: number;
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

export interface AdminUserInvite {
  user: AdminUser;
  inviteUrl: string;
}

export interface AdminInviteState {
  username: string;
  email: string;
}
