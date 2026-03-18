import type { AdminRole } from "../constants/domain";

export type { AdminRole };
export type AdminLocale = "de" | "en";

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  locale: AdminLocale;
  role: AdminRole;
  isOwner: boolean;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminStats {
  tracks: number;
  albums: number;
  users: number;
}

export interface AdminSetup {
  username: string;
  email: string;
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
