CREATE TABLE "sponsor_avatars" (
	"id" text PRIMARY KEY NOT NULL,
	"png" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sponsors" ADD COLUMN "avatar_id" text;--> statement-breakpoint
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_avatar_id_sponsor_avatars_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."sponsor_avatars"("id") ON DELETE set null ON UPDATE no action;