CREATE TABLE tracks (
  id VARCHAR(36) PRIMARY KEY,
  title TEXT NOT NULL,
  artists TEXT NOT NULL,
  album_name TEXT,
  isrc VARCHAR(15),
  artwork_url TEXT,
  duration_ms INT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_tracks_isrc ON tracks(isrc);

CREATE TABLE service_links (
  id VARCHAR(36) PRIMARY KEY,
  track_id VARCHAR(36) NOT NULL,
  service VARCHAR(50) NOT NULL,
  external_id VARCHAR(255),
  url TEXT NOT NULL,
  confidence FLOAT NOT NULL,
  match_method VARCHAR(50) NOT NULL,
  created_at BIGINT NOT NULL,
  FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE UNIQUE INDEX idx_service_links_track_service ON service_links(track_id, service);
CREATE INDEX idx_service_links_service_external ON service_links(service, external_id);

CREATE TABLE short_urls (
  id VARCHAR(12) PRIMARY KEY,
  track_id VARCHAR(36) NOT NULL,
  created_at BIGINT NOT NULL,
  FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
