import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import * as postgresSchema from "./postgres.js";

describe("PostgreSQL schema", () => {
  it("does not export retired Dynamic Forms tables", () => {
    expect(postgresSchema).not.toHaveProperty("formConfigs");
    expect(postgresSchema).not.toHaveProperty("formSubmissions");
  });

  it("adds stable identity and context ownership to content pages", () => {
    expect(postgresSchema.contentPages.id.name).toBe("id");
    expect(postgresSchema.contentPages.id.notNull).toBe(true);
    expect(postgresSchema.contentPages.id.hasDefault).toBe(true);
    expect(postgresSchema.contentPages.contextMask.name).toBe("context_mask");
    expect(postgresSchema.contentPages.contextMask.notNull).toBe(true);
  });

  it("exports context-specific content publications", () => {
    expect(postgresSchema.contentPagePublications.pageId.name).toBe("page_id");
    expect(postgresSchema.contentPagePublications.context.name).toBe("context");
    expect(postgresSchema.contentPagePublications.path.name).toBe("path");
    expect(postgresSchema.contentPagePublications.status.name).toBe("status");
    expect(postgresSchema.contentPagePublications.templateKey.name).toBe("template_key");
  });

  it("adds contextual target semantics to navigation items", () => {
    expect(postgresSchema.navItems.targetKind.name).toBe("target_kind");
    expect(postgresSchema.navItems.pageId.name).toBe("page_id");
    expect(postgresSchema.navItems.systemKey.name).toBe("system_key");
    expect(postgresSchema.navItems.contextMask.name).toBe("context_mask");
    expect(postgresSchema.navItems.areaMask.name).toBe("area_mask");

    const config = getTableConfig(postgresSchema.navItems);
    expect(config.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "chk_nav_items_target_kind",
        "chk_nav_items_system_key",
        "chk_nav_items_context_mask",
        "chk_nav_items_area_mask",
        "chk_nav_items_system_context",
        "chk_nav_items_system_target_shape",
      ]),
    );
  });

  it("exports concrete navigation placements with database constraints", () => {
    expect(postgresSchema.navigationItemPlacements.navItemId.name).toBe("nav_item_id");
    expect(postgresSchema.navigationItemPlacements.context.name).toBe("context");
    expect(postgresSchema.navigationItemPlacements.area.name).toBe("area");
    expect(postgresSchema.navigationItemPlacements.position.name).toBe("position");

    const config = getTableConfig(postgresSchema.navigationItemPlacements);
    expect(config.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "chk_navigation_item_placements_context",
        "chk_navigation_item_placements_area",
        "chk_navigation_item_placements_position",
      ]),
    );
    expect(
      config.uniqueConstraints.length + config.indexes.filter((index) => index.config.unique).length,
    ).toBeGreaterThan(0);
  });

  it("exports the developer project aggregate and project-owned subscription", () => {
    expect(postgresSchema.developerProjects.developerAccountId.name).toBe("developer_account_id");
    expect(postgresSchema.developerProjects.displayName.name).toBe("display_name");
    expect(postgresSchema.developerProjects.status.name).toBe("status");
    expect(postgresSchema.developerProjects.requestsPerMinute.name).toBe("requests_per_minute");
    expect(postgresSchema.developerProjects.requestsPerDay.name).toBe("requests_per_day");

    const projectConfig = getTableConfig(postgresSchema.developerProjects);
    expect(projectConfig.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "chk_developer_projects_status",
        "chk_developer_projects_requests_per_minute",
        "chk_developer_projects_requests_per_day",
      ]),
    );

    expect(postgresSchema.developerProjectSubscriptions.projectId.name).toBe("project_id");
    expect(postgresSchema.developerProjectSubscriptions.tierId.name).toBe("tier_id");
    const subscriptionConfig = getTableConfig(postgresSchema.developerProjectSubscriptions);
    expect(
      subscriptionConfig.uniqueConstraints.length +
        subscriptionConfig.indexes.filter((index) => index.config.unique).length,
    ).toBeGreaterThan(0);
  });

  it("models API clients as project-owned typed registrations", () => {
    expect(postgresSchema.apiClients.projectId.name).toBe("project_id");
    expect(postgresSchema.apiClients.publicClientId.name).toBe("public_client_id");
    expect(postgresSchema.apiClients.registrationType.name).toBe("registration_type");
    expect(postgresSchema.apiClients.capabilities.name).toBe("capabilities");

    const config = getTableConfig(postgresSchema.apiClients);
    expect(config.checks.map((constraint) => constraint.name)).toContain("chk_api_clients_registration_type");
    expect(
      config.uniqueConstraints.length + config.indexes.filter((index) => index.config.unique).length,
    ).toBeGreaterThan(0);
  });

  it("attributes API usage and lifecycle audit events to projects", () => {
    expect(postgresSchema.apiUsageEvents.projectId.name).toBe("project_id");
    expect(postgresSchema.apiUsageEvents.registrationId.name).toBe("registration_id");
    expect(postgresSchema.apiUsageEvents.tokenId.name).toBe("token_id");
    expect(postgresSchema.apiUsageEvents.endpointTemplate.name).toBe("endpoint_template");
    expect(postgresSchema.apiAccessAuditEvents.projectId.name).toBe("project_id");
    expect(postgresSchema.apiAccessRequests.projectId.name).toBe("project_id");
  });

  it("stores artist profile provenance and audited manual refresh attempts", () => {
    expect(postgresSchema.artistCache.profileProviders.name).toBe("profile_providers");
    expect(postgresSchema.artistCache.profileProviders.notNull).toBe(true);
    expect(postgresSchema.artistProfileRefreshEvents.actorAdminId.name).toBe("actor_admin_id");
    expect(postgresSchema.artistProfileRefreshEvents.artistEntityId.name).toBe("artist_entity_id");
    expect(postgresSchema.artistProfileRefreshEvents.trigger.name).toBe("trigger");
    expect(postgresSchema.artistProfileRefreshEvents.outcome.name).toBe("outcome");
    expect(postgresSchema.artistProfileRefreshEvents.errorCode.name).toBe("error_code");
    expect(postgresSchema.artistProfileRefreshEvents.errorId.name).toBe("error_id");

    const config = getTableConfig(postgresSchema.artistProfileRefreshEvents);
    expect(config.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "chk_artist_profile_refresh_events_trigger",
        "chk_artist_profile_refresh_events_outcome",
      ]),
    );
    expect(config.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "idx_artist_profile_refresh_events_entity_occurred",
        "idx_artist_profile_refresh_events_actor_occurred",
      ]),
    );
  });
});
