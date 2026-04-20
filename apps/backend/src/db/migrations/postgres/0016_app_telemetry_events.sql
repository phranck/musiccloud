CREATE TABLE "app_telemetry_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  "event_type" text NOT NULL,
  "event_time" timestamp with time zone NOT NULL,
  "install_id" text NOT NULL,
  "app_version" text NOT NULL,
  "build_number" text NOT NULL,
  "platform" text NOT NULL,
  "os_version" text NOT NULL,
  "device_model" text NOT NULL,
  "locale" text NOT NULL,
  "source_url" text,
  "service" text,
  "error_kind" text NOT NULL,
  "http_status" integer,
  "message" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_app_telemetry_received_at" ON "app_telemetry_events" USING btree ("received_at" DESC);
--> statement-breakpoint
CREATE INDEX "idx_app_telemetry_install_received" ON "app_telemetry_events" USING btree ("install_id","received_at" DESC);
