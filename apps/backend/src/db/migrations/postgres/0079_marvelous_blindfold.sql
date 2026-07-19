CREATE TABLE "api_usage_events" (
	"id" text PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"request_id" text NOT NULL,
	"project_id" text NOT NULL,
	"registration_id" text NOT NULL,
	"token_id" text,
	"method" text NOT NULL,
	"endpoint_template" text NOT NULL,
	"status_code" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	CONSTRAINT "chk_api_usage_events_status_code" CHECK ("api_usage_events"."status_code" BETWEEN 100 AND 599),
	CONSTRAINT "chk_api_usage_events_duration_ms" CHECK ("api_usage_events"."duration_ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "developer_project_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"tier_id" text,
	"creem_subscription_id" text,
	"creem_customer_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"interval" text,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_developer_project_subscriptions_status" CHECK ("developer_project_subscriptions"."status" IN ('active', 'trialing', 'paused', 'past_due', 'expired', 'canceled', 'scheduled_cancel')),
	CONSTRAINT "chk_developer_project_subscriptions_interval" CHECK ("developer_project_subscriptions"."interval" IS NULL OR "developer_project_subscriptions"."interval" IN ('month', 'year'))
);
--> statement-breakpoint
CREATE TABLE "developer_projects" (
	"id" text PRIMARY KEY NOT NULL,
	"developer_account_id" text NOT NULL,
	"display_name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"requests_per_minute" integer,
	"requests_per_day" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"suspended_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_by_admin_id" text,
	CONSTRAINT "chk_developer_projects_status" CHECK ("developer_projects"."status" IN ('active', 'suspended', 'deleted')),
	CONSTRAINT "chk_developer_projects_requests_per_minute" CHECK ("developer_projects"."requests_per_minute" IS NULL OR "developer_projects"."requests_per_minute" > 0),
	CONSTRAINT "chk_developer_projects_requests_per_day" CHECK ("developer_projects"."requests_per_day" IS NULL OR "developer_projects"."requests_per_day" > 0)
);
--> statement-breakpoint
ALTER TABLE "api_access_audit_events" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "api_access_requests" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "api_clients" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "api_clients" ADD COLUMN "public_client_id" text DEFAULT 'mc_client_' || replace(gen_random_uuid()::text, '-', '') NOT NULL;--> statement-breakpoint
ALTER TABLE "api_clients" ADD COLUMN "registration_type" text DEFAULT 'development' NOT NULL;--> statement-breakpoint
ALTER TABLE "api_clients" ADD COLUMN "capabilities" jsonb DEFAULT '["legacy_api_key"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "api_usage_events" ADD CONSTRAINT "api_usage_events_project_id_developer_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."developer_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_usage_events" ADD CONSTRAINT "api_usage_events_registration_id_api_clients_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."api_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_usage_events" ADD CONSTRAINT "api_usage_events_token_id_api_client_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."api_client_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_project_subscriptions" ADD CONSTRAINT "developer_project_subscriptions_project_id_developer_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."developer_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_project_subscriptions" ADD CONSTRAINT "developer_project_subscriptions_tier_id_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."tiers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_projects" ADD CONSTRAINT "developer_projects_developer_account_id_developer_accounts_id_fk" FOREIGN KEY ("developer_account_id") REFERENCES "public"."developer_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_projects" ADD CONSTRAINT "developer_projects_created_by_admin_id_admin_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_api_usage_events_project_occurred" ON "api_usage_events" USING btree ("project_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_api_usage_events_registration_occurred" ON "api_usage_events" USING btree ("registration_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_api_usage_events_request" ON "api_usage_events" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_developer_project_subscriptions_project" ON "developer_project_subscriptions" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_developer_project_subscriptions_creem_id" ON "developer_project_subscriptions" USING btree ("creem_subscription_id") WHERE "developer_project_subscriptions"."creem_subscription_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_developer_projects_account_status" ON "developer_projects" USING btree ("developer_account_id","status");--> statement-breakpoint
ALTER TABLE "api_access_audit_events" ADD CONSTRAINT "api_access_audit_events_project_id_developer_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."developer_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_access_requests" ADD CONSTRAINT "api_access_requests_project_id_developer_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."developer_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_clients" ADD CONSTRAINT "api_clients_project_id_developer_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."developer_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_api_access_requests_project" ON "api_access_requests" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_api_clients_project_status" ON "api_clients" USING btree ("project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_api_clients_public_client_id" ON "api_clients" USING btree ("public_client_id");--> statement-breakpoint
ALTER TABLE "api_clients" ADD CONSTRAINT "chk_api_clients_registration_type" CHECK ("api_clients"."registration_type" IN ('development', 'confidential', 'public'));