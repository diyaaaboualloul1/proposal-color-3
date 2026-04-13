-- SRS Platform Database Schema

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'admin',
  is_active BOOLEAN DEFAULT true,
  failed_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  client_name VARCHAR(255) NOT NULL,
  client_contact VARCHAR(255),
  description TEXT,
  status VARCHAR(50) DEFAULT 'active',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  generation_status VARCHAR(50) DEFAULT 'idle',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Questionnaires table
CREATE TABLE IF NOT EXISTS questionnaires (
  id SERIAL PRIMARY KEY,
  project_id INTEGER UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  answers JSONB DEFAULT '{}',
  status VARCHAR(50) DEFAULT 'draft',
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- SRS Versions table
CREATE TABLE IF NOT EXISTS srs_versions (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  version VARCHAR(20) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  pdf_path VARCHAR(500),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  srs_version VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activity log table
CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  action VARCHAR(255) NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Storage cleanup schedule table
CREATE TABLE IF NOT EXISTS cleanup_schedule (
  id SERIAL PRIMARY KEY,
  frequency VARCHAR(50) DEFAULT 'weekly',
  keep_versions INTEGER DEFAULT 5,
  log_days INTEGER DEFAULT 30,
  enabled BOOLEAN DEFAULT false,
  last_run TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default cleanup schedule
INSERT INTO cleanup_schedule (frequency, keep_versions, log_days, enabled)
VALUES ('weekly', 5, 30, false)
ON CONFLICT DO NOTHING;
