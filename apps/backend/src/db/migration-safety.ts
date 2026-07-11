const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export interface MigrationIdentity {
  connectionHost: string;
  currentDatabase: string;
  currentUser: string;
  expectedRemoteRole: string | undefined;
  isSuperuser: boolean;
}

interface MigrationIdentityRow {
  current_database: string;
  current_user: string;
  is_superuser: boolean;
}

interface MigrationIdentityClient {
  query(sql: string): Promise<{ rows: MigrationIdentityRow[] }>;
}

export function assertSafeMigrationIdentity(identity: MigrationIdentity): void {
  if (LOCAL_DATABASE_HOSTS.has(identity.connectionHost)) return;

  if (!identity.expectedRemoteRole) {
    throw new Error("DB_MIGRATION_ROLE is required for migrations against a remote database.");
  }

  if (identity.currentUser === "postgres") {
    throw new Error("The postgres role must never run migrations against a remote database.");
  }

  if (identity.isSuperuser) {
    throw new Error("A PostgreSQL superuser must never run migrations against a remote database.");
  }

  if (identity.currentUser !== identity.expectedRemoteRole) {
    throw new Error(`Expected remote migration role "${identity.expectedRemoteRole}", got "${identity.currentUser}".`);
  }
}

export async function assertSafeMigrationConnection(
  client: MigrationIdentityClient,
  databaseUrl: string,
  expectedRemoteRole: string | undefined,
): Promise<MigrationIdentity> {
  const connectionHost = new URL(databaseUrl).hostname;
  const result = await client.query(`
    SELECT current_database() AS current_database,
           current_user AS current_user,
           current_setting('is_superuser') = 'on' AS is_superuser
  `);
  const row = result.rows[0];
  if (!row) throw new Error("Could not determine the PostgreSQL migration identity.");

  const identity: MigrationIdentity = {
    connectionHost,
    currentDatabase: row.current_database,
    currentUser: row.current_user,
    expectedRemoteRole,
    isSuperuser: row.is_superuser,
  };
  assertSafeMigrationIdentity(identity);
  return identity;
}
