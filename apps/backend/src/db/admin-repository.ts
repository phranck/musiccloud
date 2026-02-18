export interface AdminUser {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: number;
  lastLoginAt: number | null;
}

export interface AdminRepository {
  countAdmins(): Promise<number>;
  findAdminByUsername(username: string): Promise<AdminUser | null>;
  createAdminUser(data: { id: string; username: string; passwordHash: string }): Promise<void>;
  updateLastLogin(id: string): Promise<void>;
}
