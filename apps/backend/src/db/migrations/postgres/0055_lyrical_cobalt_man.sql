CREATE TABLE "form_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"config" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_configs_name_unique" UNIQUE("name"),
	CONSTRAINT "form_configs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "form_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"form_config_id" integer NOT NULL,
	"data" jsonb NOT NULL,
	"submitter_email" text,
	"developer_account_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_form_config_id_form_configs_id_fk" FOREIGN KEY ("form_config_id") REFERENCES "public"."form_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_developer_account_id_developer_accounts_id_fk" FOREIGN KEY ("developer_account_id") REFERENCES "public"."developer_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_form_submissions_form" ON "form_submissions" USING btree ("form_config_id");--> statement-breakpoint
CREATE INDEX "idx_form_submissions_submitter_email" ON "form_submissions" USING btree ("submitter_email");--> statement-breakpoint
CREATE INDEX "idx_form_submissions_developer_account" ON "form_submissions" USING btree ("developer_account_id");