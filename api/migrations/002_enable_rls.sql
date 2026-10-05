-- Supabase exposes every table in the public schema through its REST API,
-- reachable with the project's publishable (anon) key. The agent connects
-- directly as the postgres role, which bypasses RLS, so enabling RLS with no
-- policies blocks the REST API without affecting the agent.
ALTER TABLE news_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE script_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
