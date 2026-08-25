// Push normalized events into Hobbeast via the controlled service-role RPC
// public.ingest_scraped_external_events(jsonb). Never writes raw table rows.
export async function ingestEvents(events, { supabaseUrl, serviceRoleKey, batchSize = 200, log = () => {} }) {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  const totals = { inserted: 0, updated: 0, skipped: 0 };
  for (let i = 0; i < events.length; i += batchSize) {
    const batch = events.slice(i, i + batchSize);
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/ingest_scraped_external_events`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ p_events: batch }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`ingest RPC ${res.status}: ${text.slice(0, 200)}`);
    let r; try { r = JSON.parse(text); } catch { r = {}; }
    totals.inserted += r.inserted || 0;
    totals.updated += r.updated || 0;
    totals.skipped += r.skipped || 0;
    log(`  batch ${i / batchSize + 1}: +${r.inserted || 0} ~${r.updated || 0} skip ${r.skipped || 0}`);
  }
  return totals;
}
