-- Speed-up indexes for salon_cache.
-- Run once in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/dabeuqxwrgvicytasjus/sql
--
-- These make the Contacts tab and Map load 5-10x faster by letting
-- Postgres filter/sort without scanning all 15k rows.

CREATE INDEX IF NOT EXISTS idx_salon_cache_lifetime_sales
  ON salon_cache (lifetime_sales DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_salon_cache_state
  ON salon_cache (state);

CREATE INDEX IF NOT EXISTS idx_salon_cache_distributor_code
  ON salon_cache (distributor_code);

CREATE INDEX IF NOT EXISTS idx_salon_cache_is_active
  ON salon_cache (is_active);

CREATE INDEX IF NOT EXISTS idx_salon_cache_email_null
  ON salon_cache (email) WHERE email IS NULL;

-- Optional: speeds up free-text search on salon name
CREATE INDEX IF NOT EXISTS idx_salon_cache_salon_name_trgm
  ON salon_cache USING GIN (salon_name gin_trgm_ops);

-- (The trigram index requires pg_trgm. If the above fails, skip it — the other
--  indexes are enough and text search will still work via ILIKE.)
