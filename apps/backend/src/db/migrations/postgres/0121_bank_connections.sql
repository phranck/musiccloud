CREATE TABLE "bank_authorization_states" (
	"state" text PRIMARY KEY NOT NULL,
	"authorization_id" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"account_uid" text NOT NULL,
	"aspsp_name" text DEFAULT '' NOT NULL,
	"aspsp_country" text DEFAULT '' NOT NULL,
	"consent_valid_until" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"consent_notice_stage" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_bank_connections_consent_notice_stage" CHECK ("bank_connections"."consent_notice_stage" IS NULL OR "bank_connections"."consent_notice_stage" IN ('soon', 'imminent', 'lapsed'))
);
--> statement-breakpoint
CREATE INDEX "idx_bank_authorization_states_expires_at" ON "bank_authorization_states" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_bank_connections_one_live" ON "bank_connections" USING btree (("revoked_at" IS NULL)) WHERE "bank_connections"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_bank_connections_created_at" ON "bank_connections" USING btree ("created_at");