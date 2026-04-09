CREATE TABLE "site_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);

-- Seed default settings
INSERT INTO "site_settings" ("key", "value", "updated_at")
VALUES ('tracking_enabled', 'true', NOW())
ON CONFLICT ("key") DO NOTHING;
