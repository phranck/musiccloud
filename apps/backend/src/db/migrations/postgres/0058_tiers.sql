CREATE TABLE "tiers" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "requests_per_minute" integer NOT NULL,
  "requests_per_day" integer NOT NULL,
  "attribution_required" boolean NOT NULL DEFAULT false,
  "price" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "uq_tiers_name" UNIQUE ("name"),
  CONSTRAINT "chk_tiers_requests_per_minute" CHECK ("requests_per_minute" > 0),
  CONSTRAINT "chk_tiers_requests_per_day" CHECK ("requests_per_day" > 0)
);

INSERT INTO "tiers" ("id", "name", "requests_per_minute", "requests_per_day", "attribution_required", "price", "sort_order")
VALUES ('tier_free', 'Free', 60, 10000, false, null, 0);
