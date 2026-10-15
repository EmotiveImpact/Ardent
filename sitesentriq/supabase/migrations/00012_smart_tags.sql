-- ============================================================
-- Migration 00011: Smart Tags
-- Adds: tags text[] column to jobs, actions, compliance_items,
--       invoices, and documents to support free-form tagging
--       and bulk operations from the UI.
-- ============================================================

ALTER TABLE jobs              ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE actions           ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE compliance_items  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE invoices          ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE documents         ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- GIN indexes for fast `tags @> array['foo']` lookups
CREATE INDEX IF NOT EXISTS jobs_tags_idx              ON jobs              USING gin (tags);
CREATE INDEX IF NOT EXISTS actions_tags_idx           ON actions           USING gin (tags);
CREATE INDEX IF NOT EXISTS compliance_items_tags_idx  ON compliance_items  USING gin (tags);
CREATE INDEX IF NOT EXISTS invoices_tags_idx          ON invoices          USING gin (tags);
CREATE INDEX IF NOT EXISTS documents_tags_idx         ON documents         USING gin (tags);
