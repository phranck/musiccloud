CREATE TABLE "content_page_publications" (
	"page_id" text NOT NULL,
	"context" integer NOT NULL,
	"path" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"template_key" text NOT NULL,
	CONSTRAINT "pk_content_page_publications" PRIMARY KEY("page_id","context"),
	CONSTRAINT "chk_content_page_publications_context" CHECK ("content_page_publications"."context" IN (1, 2)),
	CONSTRAINT "chk_content_page_publications_status" CHECK ("content_page_publications"."status" IN ('draft', 'published', 'hidden'))
);
--> statement-breakpoint
ALTER TABLE "content_page_publications" ADD CONSTRAINT "content_page_publications_page_id_content_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."content_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_content_page_publications_context_path" ON "content_page_publications" USING btree ("context","path");--> statement-breakpoint
CREATE INDEX "idx_content_page_publications_page" ON "content_page_publications" USING btree ("page_id");