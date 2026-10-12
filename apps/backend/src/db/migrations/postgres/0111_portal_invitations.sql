CREATE TABLE "developer_portal_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_by_admin_id" text,
	"account_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"redeemed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "developer_accounts" ADD COLUMN "portal_access_granted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "developer_portal_invitations" ADD CONSTRAINT "developer_portal_invitations_created_by_admin_id_admin_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_portal_invitations" ADD CONSTRAINT "developer_portal_invitations_account_id_developer_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."developer_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_developer_portal_invitations_token_hash" ON "developer_portal_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_developer_portal_invitations_open_email" ON "developer_portal_invitations" USING btree ("email") WHERE "developer_portal_invitations"."redeemed_at" IS NULL AND "developer_portal_invitations"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_developer_portal_invitations_account" ON "developer_portal_invitations" USING btree ("account_id");