CREATE TABLE `service_links` (
	`id` text PRIMARY KEY NOT NULL,
	`track_id` text NOT NULL,
	`service` text NOT NULL,
	`external_id` text NOT NULL,
	`url` text NOT NULL,
	`confidence` real NOT NULL,
	`match_method` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_service_links_track_service` ON `service_links` (`track_id`,`service`);--> statement-breakpoint
CREATE INDEX `idx_service_links_service_external` ON `service_links` (`service`,`external_id`);--> statement-breakpoint
CREATE TABLE `short_urls` (
	`id` text PRIMARY KEY NOT NULL,
	`track_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`artists` text NOT NULL,
	`album_name` text,
	`isrc` text,
	`artwork_url` text,
	`duration_ms` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tracks_isrc` ON `tracks` (`isrc`);