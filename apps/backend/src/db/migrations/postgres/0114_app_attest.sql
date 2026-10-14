CREATE TABLE "app_attest_challenges" (
	"challenge" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_attest_keys" (
	"key_id" text PRIMARY KEY NOT NULL,
	"public_key" "bytea" NOT NULL,
	"sign_count" bigint DEFAULT 0 NOT NULL,
	"environment" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "chk_app_attest_keys_environment" CHECK ("app_attest_keys"."environment" IN ('production', 'development')),
	CONSTRAINT "chk_app_attest_keys_sign_count" CHECK ("app_attest_keys"."sign_count" BETWEEN 0 AND 4294967295)
);
--> statement-breakpoint
CREATE INDEX "idx_app_attest_challenges_expires_at" ON "app_attest_challenges" USING btree ("expires_at");