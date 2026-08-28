-- Live progress for a running crawl, so the admin panel sees it move instead of
-- waiting for the whole thing to finish. record_crawl_run_progress updates the
-- counters WITHOUT touching finished_at or status — the run stays 'running'
-- until it closes. Applied via the Supabase MCP; this file is the record.
SELECT 'see live database for record_crawl_run_progress(uuid, jsonb)' AS note;
