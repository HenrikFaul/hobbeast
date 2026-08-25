// Admin-gated scraper control plane.
//   action 'run'    -> dispatches the GitHub event-scraper workflow, optionally
//                      restricted to selected source_ids (workflow input "only").
//   action 'status' -> recent scraper_runs rows for the progress panel.
// The GitHub token lives in Supabase Vault ('github_workflow_token'); only the
// service role can decrypt it and it never reaches the browser.

import { corsHeaders, getSupabaseAdmin, jsonResponse } from '../shared/providerFetch.ts';
import { requireAuthenticatedUserClient } from '../shared/userAuth.ts';

const REPO = 'HenrikFaul/hobbeast';
const WORKFLOW = 'event-scraper.yml';
const MAX_SELECTED = 100;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const requestId = crypto.randomUUID();
  if (req.method !== 'POST') return jsonResponse({ error: { code: 'METHOD_NOT_ALLOWED' }, request_id: requestId }, 405);

  try {
    const body = await req.json() as { action?: string; source_ids?: unknown; since?: string };
    const { user } = await requireAuthenticatedUserClient(req);
    const admin = getSupabaseAdmin(req);

    const { data: allowed, error: capError } = await admin.rpc('admin_has_capability', {
      _user_id: user.id, _capability_key: 'providers.manage',
    });
    if (capError || !allowed) return jsonResponse({ error: { code: 'CAPABILITY_REQUIRED' }, request_id: requestId }, 403);

    if (body.action === 'status') {
      const since = body.since && !Number.isNaN(Date.parse(body.since))
        ? body.since : new Date(Date.now() - 2 * 3600_000).toISOString();
      const { data, error } = await admin.rpc('admin_recent_scraper_runs', { p_since: since });
      if (error) throw new Error('STATUS_FAILED');
      return jsonResponse({ runs: data ?? [], request_id: requestId });
    }

    if (body.action === 'run') {
      const ids = Array.isArray(body.source_ids)
        ? body.source_ids.filter((v) => typeof v === 'string' && /^src_[a-f0-9]{8}$/.test(v)).slice(0, MAX_SELECTED)
        : [];
      const { data: token, error: vaultError } = await admin.rpc('get_scraper_dispatch_token');
      if (vaultError || !token) return jsonResponse({ error: { code: 'DISPATCH_TOKEN_MISSING' }, request_id: requestId }, 503);

      const inputs: Record<string, string> = ids.length ? { only: ids.join(',') } : {};
      const ghRes = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/vnd.github+json',
          'content-type': 'application/json',
          'user-agent': 'hobbeast-scraper-control',
        },
        body: JSON.stringify({ ref: 'main', inputs }),
      });
      if (ghRes.status !== 204) {
        const detail = (await ghRes.text()).slice(0, 120);
        console.error(JSON.stringify({ level: 'error', code: 'DISPATCH_FAILED', status: ghRes.status, detail, request_id: requestId }));
        return jsonResponse({ error: { code: 'DISPATCH_FAILED' }, request_id: requestId }, 502);
      }
      return jsonResponse({ dispatched: true, selected: ids.length || null, started_at: new Date().toISOString(), request_id: requestId }, 202);
    }

    return jsonResponse({ error: { code: 'INVALID_ACTION' }, request_id: requestId }, 400);
  } catch (error) {
    const code = error instanceof Error && /AUTH_/.test(error.message) ? error.message : 'SCRAPER_CONTROL_FAILED';
    return jsonResponse({ error: { code } }, code.startsWith('AUTH_') ? 401 : 500);
  }
});
