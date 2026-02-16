CREATE TABLE tracks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artists TEXT NOT NULL,
  album_name TEXT,
  isrc TEXT,
  artwork_url TEXT,
  duration_ms INTEGER,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX idx_tracks_isrc ON tracks(isrc);

CREATE TABLE service_links (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  external_id TEXT,
  url TEXT NOT NULL,
  confidence REAL NOT NULL,
  match_method TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE UNIQUE INDEX idx_service_links_track_service ON service_links(track_id, service);
CREATE INDEX idx_service_links_service_external ON service_links(service, external_id);
CREATE INDEX idx_service_links_url ON service_links(url);

CREATE TABLE short_urls (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL
);
