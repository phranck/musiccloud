PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_service_links` (
	`id` text PRIMARY KEY NOT NULL,
	`track_id` text NOT NULL,
	`service` text NOT NULL,
	`external_id` text,
	`url` text NOT NULL,
	`confidence` real NOT NULL,
	`match_method` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_service_links`("id", "track_id", "service", "external_id", "url", "confidence", "match_method", "created_at") SELECT "id", "track_id", "service", "external_id", "url", "confidence", "match_method", "created_at" FROM `service_links`;--> statement-breakpoint
DROP TABLE `service_links`;--> statement-breakpoint
ALTER TABLE `__new_service_links` RENAME TO `service_links`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_service_links_track_service` ON `service_links` (`track_id`,`service`);--> statement-breakpoint
CREATE INDEX `idx_service_links_service_external` ON `service_links` (`service`,`external_id`);