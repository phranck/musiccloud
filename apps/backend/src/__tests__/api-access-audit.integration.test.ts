import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeRepository, getApiAccessRepository } from "../db/index.js";
import { connectRepositoriesToIntegrationDatabase, integrationDatabaseUrl } from "./integration-database.js";

describe.skipIf(!integrationDatabaseUrl())("API-access audit trail (integration)", () => {
  connectRepositoriesToIntegrationDatabase();

  const suffix = Math.random().toString(36).slice(2, 10);
  const adminId = `audit-admin-${suffix}`;
  const developerId = `audit-developer-${suffix}`;
  const projectId = `audit-project-${suffix}`;
  const otherProjectId = `audit-other-${suffix}`;
  const eventId = (name: string) => `audit-event-${suffix}-${name}`;

  let client: pg.Client;

  async function insertEvent(id: string, project: string, occurredAt: string, actor: "admin" | "developer") {
    await client.query(
      `INSERT INTO api_access_audit_events
         (id, project_id, event_type, actor_admin_id, actor_developer_account_id, occurred_at, event_data)
       VALUES ($1, $2, 'project_updated', $3, $4, $5, '{"status":"active"}')`,
      [id, project, actor === "admin" ? adminId : null, actor === "developer" ? developerId : null, occurredAt],
    );
  }

  beforeAll(async () => {
    client = new pg.Client({ connectionString: integrationDatabaseUrl() });
    await client.connect();
    await client.query(
      `INSERT INTO admin_users (id, username, password_hash, role, created_at) VALUES ($1, $1, 'unused', 'admin', NOW())`,
      [adminId],
    );
    await client.query(`INSERT INTO developer_accounts (id, email) VALUES ($1, $2)`, [
      developerId,
      `${developerId}@example.test`,
    ]);
    await client.query(
      `INSERT INTO developer_projects (id, developer_account_id, display_name) VALUES ($1, $3, 'Audited'), ($2, $3, 'Other')`,
      [projectId, otherProjectId, developerId],
    );
    // Old enough that no real row can share these dates, which is what lets
    // the retention test delete before a cutoff in the same year.
    await insertEvent(eventId("oldest"), projectId, "2000-01-01T00:00:00Z", "admin");
    await insertEvent(eventId("middle"), projectId, "2000-08-01T00:00:00Z", "developer");
    await insertEvent(eventId("newest"), projectId, "2000-11-01T00:00:00Z", "admin");
    await insertEvent(eventId("other"), otherProjectId, "2000-09-01T00:00:00Z", "admin");
  });

  afterAll(async () => {
    await client.query(`DELETE FROM api_access_audit_events WHERE id LIKE $1`, [`audit-event-${suffix}-%`]);
    await client.query(`DELETE FROM developer_projects WHERE id = ANY($1::text[])`, [[projectId, otherProjectId]]);
    await client.query(`DELETE FROM developer_accounts WHERE id = $1`, [developerId]);
    await client.query(`DELETE FROM admin_users WHERE id = $1`, [adminId]);
    await client.end();
    await closeRepository();
  });

  it("lists one project's entries inside the range, newest first, with each actor named", async () => {
    const repo = await getApiAccessRepository();

    const entries = await repo.listProjectAuditEvents(
      projectId,
      Date.parse("2000-02-01T00:00:00Z"),
      Date.parse("2001-01-01T00:00:00Z"),
      10,
    );

    expect(entries.map((entry) => entry.id)).toEqual([eventId("newest"), eventId("middle")]);
    expect(entries[0]).toMatchObject({ actorAdminUsername: adminId, actorDeveloperEmail: null });
    expect(entries[1]).toMatchObject({ actorAdminUsername: null, actorDeveloperEmail: `${developerId}@example.test` });
  });

  it("returns no more rows than asked for", async () => {
    const repo = await getApiAccessRepository();

    const entries = await repo.listProjectAuditEvents(
      projectId,
      Date.parse("2000-01-01T00:00:00Z"),
      Date.parse("2001-01-01T00:00:00Z"),
      2,
    );

    expect(entries.map((entry) => entry.id)).toEqual([eventId("newest"), eventId("middle")]);
  });

  it("removes rows older than the cutoff and keeps the rest", async () => {
    const repo = await getApiAccessRepository();

    await repo.deleteApiAccessAuditEventsBefore(Date.parse("2000-06-01T00:00:00Z"));

    const remaining = await client.query<{ id: string }>(
      `SELECT id FROM api_access_audit_events WHERE id LIKE $1 ORDER BY id`,
      [`audit-event-${suffix}-%`],
    );
    expect(remaining.rows.map((row) => row.id)).toEqual([eventId("middle"), eventId("newest"), eventId("other")]);
  });
});
