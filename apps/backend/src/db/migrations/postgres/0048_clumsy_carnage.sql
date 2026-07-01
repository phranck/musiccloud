CREATE TABLE "api_access_audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text,
	"request_id" text,
	"token_id" text,
	"event_type" text NOT NULL,
	"actor_admin_id" text,
	"actor_developer_account_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_data" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_access_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"developer_account_id" text NOT NULL,
	"contact_email" text NOT NULL,
	"app_name" text NOT NULL,
	"app_description" text NOT NULL,
	"estimated_requests_per_day" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_admin_id" text,
	"review_note" text,
	CONSTRAINT "chk_api_access_requests_status" CHECK ("api_access_requests"."status" IN ('pending', 'approved', 'rejected', 'archived')),
	CONSTRAINT "chk_api_access_requests_estimated_requests" CHECK ("api_access_requests"."estimated_requests_per_day" > 0)
);
--> statement-breakpoint
CREATE TABLE "api_client_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"token_prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"rotated_from_token_id" text,
	CONSTRAINT "chk_api_client_tokens_status" CHECK ("api_client_tokens"."status" IN ('active', 'revoked', 'rotated'))
);
--> statement-breakpoint
CREATE TABLE "api_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text,
	"developer_account_id" text NOT NULL,
	"app_name" text NOT NULL,
	"contact_email" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"requests_per_minute" integer DEFAULT 60 NOT NULL,
	"requests_per_day" integer DEFAULT 10000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_admin_id" text,
	CONSTRAINT "chk_api_clients_status" CHECK ("api_clients"."status" IN ('active', 'suspended', 'revoked')),
	CONSTRAINT "chk_api_clients_requests_per_minute" CHECK ("api_clients"."requests_per_minute" > 0),
	CONSTRAINT "chk_api_clients_requests_per_day" CHECK ("api_clients"."requests_per_day" > 0)
);
--> statement-breakpoint
ALTER TABLE "api_access_audit_events" ADD CONSTRAINT "api_access_audit_events_client_id_api_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."api_clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_access_audit_events" ADD CONSTRAINT "api_access_audit_events_request_id_api_access_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."api_access_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_access_audit_events" ADD CONSTRAINT "api_access_audit_events_token_id_api_client_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."api_client_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_access_audit_events" ADD CONSTRAINT "api_access_audit_events_actor_admin_id_admin_users_id_fk" FOREIGN KEY ("actor_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_access_audit_events" ADD CONSTRAINT "api_access_audit_events_actor_developer_account_id_developer_accounts_id_fk" FOREIGN KEY ("actor_developer_account_id") REFERENCES "public"."developer_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_access_requests" ADD CONSTRAINT "api_access_requests_developer_account_id_developer_accounts_id_fk" FOREIGN KEY ("developer_account_id") REFERENCES "public"."developer_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_access_requests" ADD CONSTRAINT "api_access_requests_reviewed_by_admin_id_admin_users_id_fk" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_client_tokens" ADD CONSTRAINT "api_client_tokens_client_id_api_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."api_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_clients" ADD CONSTRAINT "api_clients_request_id_api_access_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."api_access_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_clients" ADD CONSTRAINT "api_clients_developer_account_id_developer_accounts_id_fk" FOREIGN KEY ("developer_account_id") REFERENCES "public"."developer_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_clients" ADD CONSTRAINT "api_clients_created_by_admin_id_admin_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_api_access_audit_events_client_occurred" ON "api_access_audit_events" USING btree ("client_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_api_access_requests_status_submitted" ON "api_access_requests" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "idx_api_access_requests_developer_account" ON "api_access_requests" USING btree ("developer_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_api_client_tokens_prefix" ON "api_client_tokens" USING btree ("token_prefix");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_api_client_tokens_hash" ON "api_client_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_api_client_tokens_client_status" ON "api_client_tokens" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "idx_api_clients_status" ON "api_clients" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_api_clients_developer_account" ON "api_clients" USING btree ("developer_account_id");