-- SRS Proposal Builder tables
-- Created: 2026-05-01

-- Proposals table
CREATE TABLE IF NOT EXISTS proposals (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  srs_version VARCHAR(20),
  template_id INTEGER REFERENCES proposal_templates(id) ON DELETE SET NULL,
  blocks JSONB DEFAULT '[]',
  status VARCHAR(50) DEFAULT 'draft',
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Proposal versions table (for version history)
CREATE TABLE IF NOT EXISTS proposal_versions (
  id SERIAL PRIMARY KEY,
  proposal_id INTEGER NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  blocks JSONB NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Proposal templates table
CREATE TABLE IF NOT EXISTS proposal_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  blocks JSONB NOT NULL,
  is_system BOOLEAN DEFAULT false,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_proposals_project_id ON proposals(project_id);
CREATE INDEX idx_proposals_status ON proposals(status);
CREATE INDEX idx_proposal_versions_proposal_id ON proposal_versions(proposal_id);
CREATE INDEX idx_proposal_templates_is_system ON proposal_templates(is_system);
