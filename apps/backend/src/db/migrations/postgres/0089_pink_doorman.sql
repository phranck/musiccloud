ALTER TABLE "api_access_audit_events" DROP CONSTRAINT "api_access_audit_events_request_id_api_access_requests_id_fk";
--> statement-breakpoint
ALTER TABLE "api_clients" DROP CONSTRAINT "api_clients_request_id_api_access_requests_id_fk";
--> statement-breakpoint
ALTER TABLE "api_access_audit_events" DROP COLUMN "request_id";--> statement-breakpoint
ALTER TABLE "api_clients" DROP COLUMN "request_id";