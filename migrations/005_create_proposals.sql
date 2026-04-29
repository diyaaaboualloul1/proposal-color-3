-- Proposals table for Fifty Studios SRS Platform
-- Standalone proposals (no project) and in-project proposals

CREATE TABLE IF NOT EXISTS proposals (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  client_name VARCHAR(255) DEFAULT '',
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  srs_version VARCHAR(50) DEFAULT NULL, -- e.g., 'v1.0' — null for standalone
  timeline_type VARCHAR(10) DEFAULT 'phase', -- 'phase' or 'week'
  timeline_data JSONB DEFAULT '[]', -- [{name: "Phase 1", duration: "3 weeks"}, ...]
  original_price DECIMAL(12,2) DEFAULT 0,
  discounted_price DECIMAL(12,2) DEFAULT 0,
  payment_terms JSONB DEFAULT '[{"label":"50% upon contract signing","percentage":50},{"label":"50% upon final delivery","percentage":50}]',
  maintenance_second_year DECIMAL(12,2) DEFAULT 600.00,
  exclusions TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  ai_timeline_edit BOOLEAN DEFAULT false,
  content TEXT DEFAULT '', -- the generated proposal markdown
  status VARCHAR(20) DEFAULT 'draft', -- draft | generated | accepted
  pdf_path VARCHAR(500) DEFAULT '',
  docx_path VARCHAR(500) DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_proposals_project ON proposals(project_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_created_by ON proposals(created_by);

COMMENT ON TABLE proposals IS 'Stores both standalone proposals and in-project proposals. project_id IS NULL for standalone proposals.';