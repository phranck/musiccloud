CREATE TABLE "developer_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"password_hash" text,
	"display_name" text,
	"avatar_url" text,
	"plan" text DEFAULT 'free' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "developer_accounts_email_unique" UNIQUE("email"),
	CONSTRAINT "chk_developer_accounts_plan" CHECK ("developer_accounts"."plan" IN ('free')),
	CONSTRAINT "chk_developer_accounts_status" CHECK ("developer_accounts"."status" IN ('active', 'suspended'))
);
--> statement-breakpoint
CREATE TABLE "developer_email_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_developer_email_tokens_purpose" CHECK ("developer_email_tokens"."purpose" IN ('verify', 'reset'))
);
--> statement-breakpoint
CREATE TABLE "developer_identities" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_developer_identities_provider" CHECK ("developer_identities"."provider" IN ('email', 'github'))
);
--> statement-breakpoint
ALTER TABLE "developer_email_tokens" ADD CONSTRAINT "developer_email_tokens_account_id_developer_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."developer_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_identities" ADD CONSTRAINT "developer_identities_account_id_developer_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."developer_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_developer_email_tokens_token_hash" ON "developer_email_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_developer_identities_account_provider" ON "developer_identities" USING btree ("account_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_developer_identities_provider_user" ON "developer_identities" USING btree ("provider","provider_user_id");