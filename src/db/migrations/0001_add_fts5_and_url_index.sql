-- Add URL index for fast URL lookups
CREATE INDEX `idx_service_links_url` ON `service_links` (`url`);
--> statement-breakpoint
-- Add FTS5 Virtual Table for full-text search on tracks
CREATE VIRTUAL TABLE `tracks_fts` USING fts5(
  title,
  artists,
  content=tracks,
  content_rowid=id
);
--> statement-breakpoint
-- Create triggers to keep FTS5 index in sync with tracks table
CREATE TRIGGER `tracks_ai` AFTER INSERT ON `tracks` BEGIN
  INSERT INTO `tracks_fts` (rowid, title, artists) VALUES (new.id, new.title, new.artists);
END;
--> statement-breakpoint
CREATE TRIGGER `tracks_ad` AFTER DELETE ON `tracks` BEGIN
  INSERT INTO `tracks_fts` (`tracks_fts`, rowid, title, artists) VALUES ('delete', old.id, old.title, old.artists);
END;
--> statement-breakpoint
CREATE TRIGGER `tracks_au` AFTER UPDATE ON `tracks` BEGIN
  INSERT INTO `tracks_fts` (`tracks_fts`, rowid, title, artists) VALUES ('delete', old.id, old.title, old.artists);
  INSERT INTO `tracks_fts` (rowid, title, artists) VALUES (new.id, new.title, new.artists);
END;
