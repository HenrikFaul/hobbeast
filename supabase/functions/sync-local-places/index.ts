// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, getSupabaseAdmin, jsonResponse } from '../shared/providerFetch.ts';
import { DEFAULT_SYNC_CONFIG, MILESTONES } from './_shared/constants/sync.ts';
import { appendLog } from './_shared/repositories/logRepo.ts';
import { upsertSyncState } from './_shared/repositories/stateRepo.ts';
import { handleEnqueue } from './_shared/handlers/handleEnqueue.ts';
import { handleGetConfig } from './_shared/handlers/handleGetConfig.ts';
import { handleSaveConfig } from './_shared/handlers/handleSaveConfig.ts';
import { handleSchedule } from './_shared/handlers/handleSchedule.ts';
import { handleStatus } from './_shared/handlers/handleStatus.ts';
import { handleUnschedule } from './_shared/handlers/handleUnschedule.ts';
import type { SyncAction, SyncBody } from './_shared/types/index.ts';
import { clamp } from './_shared/utils/math.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const runId = crypto.randomUUID();
  const supabaseAdmin = getSupabaseAdmin(req);

  try {
    const url = new URL(req.url);
    const queryAction = url.searchParams.get('action');
    const queryReset = url.searchParams.get('reset');
    const body = await req.json().catch(() => ({})) as SyncBody;

    const action = (queryAction || body.action || 'status') as SyncAction;
    const reset = queryReset === 'true' || body.reset === true;
    const effectiveBody: SyncBody = { ...body, action, reset };

    await appendLog(supabaseAdmin, 'info', MILESTONES.REQ_RECEIVED, 'sync-local-places request received', {
      method: req.method,
      action,
      reset,
    }, runId);

    if (action === 'status') {
      return jsonResponse(await handleStatus(supabaseAdmin));
    }

    if (action === 'get_config') {
      return jsonResponse(await handleGetConfig(supabaseAdmin));
    }

    if (action === 'save_config') {
      return jsonResponse(await handleSaveConfig(supabaseAdmin, body.config as any, (l,e,m,d,r) => appendLog(supabaseAdmin,l,e,m,d,r), runId));
    }

    if (action === 'schedule') {
      const minutes = clamp(Number(body.interval_minutes ?? DEFAULT_SYNC_CONFIG.interval_minutes), 1, 60);
      return jsonResponse(await handleSchedule(supabaseAdmin, minutes, (l,e,m,d,r) => appendLog(supabaseAdmin,l,e,m,d,r), runId));
    }

    if (action === 'unschedule') {
      return jsonResponse(await handleUnschedule(supabaseAdmin, (l,e,m,d,r) => appendLog(supabaseAdmin,l,e,m,d,r), runId));
    }

    if (action === 'enqueue') {
      return jsonResponse(await handleEnqueue(supabaseAdmin, effectiveBody, (l,e,m,d,r) => appendLog(supabaseAdmin,l,e,m,d,r), runId));
    }

    return jsonResponse(await handleEnqueue(supabaseAdmin, effectiveBody, (l,e,m,d,r) => appendLog(supabaseAdmin,l,e,m,d,r), runId));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    await upsertSyncState(supabaseAdmin, {
      key: 'local_places',
      status: 'error',
      last_error: message,
      last_run_completed_at: new Date().toISOString(),
    });

    await appendLog(
      supabaseAdmin,
      'error',
      MILESTONES.ERROR_REPORTED,
      'Lokális címszinkron hiba történt',
      { error: message },
      runId,
    );

    console.error('sync-local-places error', error);
    return jsonResponse({ error: message }, 500);
  }
});
