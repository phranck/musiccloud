CREATE TABLE "developer_portal_availability_events" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_admin_id" text NOT NULL,
	"public" boolean NOT NULL,
	"maintenance" boolean NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "developer_portal_availability_events" ADD CONSTRAINT "developer_portal_availability_events_actor_admin_id_admin_users_id_fk" FOREIGN KEY ("actor_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_developer_portal_availability_events_occurred" ON "developer_portal_availability_events" USING btree ("occurred_at" DESC NULLS LAST);