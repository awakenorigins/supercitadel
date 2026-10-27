-- ============================================================
-- SOUL-TRADE — Migration 0002_memory_vector  (HOST-ONLY: needs pgvector)
-- Adds semantic memory: embed each decision so the bot/agents can recall
-- similar past situations. The host image is pgvector/pgvector:pg16.
-- Safe to skip on engines without the `vector` extension.
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE st_decisions ADD COLUMN IF NOT EXISTS embedding vector(1536);
CREATE INDEX IF NOT EXISTS st_decisions_embedding_idx
  ON st_decisions USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
