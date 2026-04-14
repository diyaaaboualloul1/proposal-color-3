-- Migration: Add Google Drive integration fields
-- Run this on existing databases

-- Add Google Drive columns to srs_versions
ALTER TABLE srs_versions ADD COLUMN IF NOT EXISTS drive_folder_id VARCHAR(255) DEFAULT NULL;
ALTER TABLE srs_versions ADD COLUMN IF NOT EXISTS drive_file_id_docx VARCHAR(255) DEFAULT NULL;
ALTER TABLE srs_versions ADD COLUMN IF NOT EXISTS drive_share_url TEXT DEFAULT NULL;

-- Create platform_settings table if it doesn't exist
CREATE TABLE IF NOT EXISTS platform_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(255) UNIQUE NOT NULL,
  setting_value TEXT,
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by INTEGER REFERENCES users(id)
);

-- Insert default Google Drive settings (ignore if already exists)
INSERT INTO platform_settings (setting_key, setting_value) VALUES
  ('google_drive_enabled', 'false'),
  ('google_drive_root_folder_id', NULL),
  ('google_service_account_email', NULL),
  ('google_service_account_key', NULL)
ON CONFLICT (setting_key) DO NOTHING;
