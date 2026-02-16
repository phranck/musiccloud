-- Full-text search using MySQL FULLTEXT index
-- Requires InnoDB (MySQL 5.6+) or MyISAM

ALTER TABLE tracks ADD FULLTEXT INDEX idx_tracks_fulltext (title, artists);
