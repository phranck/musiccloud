-- Add release_date column to tracks table
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS release_date TEXT;
