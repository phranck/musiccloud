ALTER TABLE "content_pages" ADD COLUMN "id" text DEFAULT gen_random_uuid()::text NOT NULL;--> statement-breakpoint
ALTER TABLE "content_pages" ADD COLUMN "context_mask" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "content_pages" ADD CONSTRAINT "content_pages_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "content_pages" ADD CONSTRAINT "chk_content_pages_context_mask" CHECK ("content_pages"."context_mask" IN (1, 2, 3));