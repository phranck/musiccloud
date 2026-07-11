CREATE TABLE "album_vinyl_layout_identities" (
	"identity_key" text PRIMARY KEY NOT NULL,
	"album_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DROP INDEX "uq_albums_identity_key";--> statement-breakpoint
ALTER TABLE "album_vinyl_layout_identities" ADD CONSTRAINT "album_vinyl_layout_identities_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_album_vinyl_layout_identities_album" ON "album_vinyl_layout_identities" USING btree ("album_id");--> statement-breakpoint
ALTER TABLE "albums" DROP COLUMN "identity_key";