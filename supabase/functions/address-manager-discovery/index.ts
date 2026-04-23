// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, getSupabaseAdmin, resolveInternalSupabaseUrl } from '../shared/providerFetch.ts';
import { buildSummary, ensureMatrixSeeds, getMatrix, listVenues, loadLimits, saveLimits, setSelections } from '../address-manager-shared/repository.ts';
import type { ProviderKey } from '../address-manager-shared/types.ts';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function callInternalFunction<T>(req: Request, functionName: string, body: Record<string, unknown>) {
  const baseUrl = resolveInternalSupabaseUrl(req);
  const res = await fetch(`${baseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({} as T));
  if (!res.ok) {
    throw new Error(`Internal function ${functionName} failed: ${res.status} ${JSON.stringify(payload)}`);
  }
  return payload as T;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseAdmin = getSupabaseAdmin(req);
  const body = await req.json().catch(() => ({})) as any;
  const action = String(body.action || 'bootstrap');

  try {
    await ensureMatrixSeeds(supabaseAdmin);

    if (action === 'save_limits') {
      const limits = await saveLimits(supabaseAdmin, body.limits || {});
      return json({
        ok: true,
        limits,
        matrix: await getMatrix(supabaseAdmin),
        summary: await buildSummary(supabaseAdmin),
      });
    }

    if (action === 'save_selection') {
      await setSelections(supabaseAdmin, Array.isArray(body.updates) ? body.updates : []);
      return json({
        ok: true,
        limits: await loadLimits(supabaseAdmin),
        matrix: await getMatrix(supabaseAdmin),
        summary: await buildSummary(supabaseAdmin),
      });
    }

    if (action === 'list_venues') {
      const provider = String(body.provider || 'all') as ProviderKey | 'all';
      const countries = Array.isArray(body.countries) ? body.countries.map((item: unknown) => String(item).toUpperCase()) : [];
      const categories = Array.isArray(body.categories) ? body.categories.map((item: unknown) => String(item)) : [];
      const venues = await listVenues(supabaseAdmin, {
        provider,
        countries,
        categories,
        page: Number(body.page || 1),
        pageSize: Number(body.pageSize || 25),
      });
      return json({ ok: true, ...venues, summary: await buildSummary(supabaseAdmin) });
    }

    if (action === 'run_chunk') {
      const limits = await loadLimits(supabaseAdmin);
      const iterations = Math.max(1, Math.min(Number(body.iterations || limits.worker_chunk_size || 1), 100));
      const steps: Array<Record<string, unknown>> = [];
      let totalWritten = 0;

      for (let index = 0; index < iterations; index += 1) {
        const generated = await callInternalFunction<{ ok: boolean; generated: boolean; task?: Record<string, unknown>; reason?: string }>(
          req,
          'address-manager-task-generator',
          {},
        );

        if (!generated.ok || !generated.generated || !generated.task) {
          steps.push({ step: index + 1, generated: generated.generated || false, reason: generated.reason || 'done' });
          break;
        }

        const worker = await callInternalFunction<{ ok: boolean; written?: number; done?: boolean; tileIndex?: number; nextTileIndex?: number; totalTiles?: number }>(
          req,
          'address-manager-worker',
          { task: generated.task },
        );

        totalWritten += Number(worker.written || 0);
        steps.push({
          step: index + 1,
          generated: true,
          task: generated.task,
          worker,
        });
      }

      return json({
        ok: true,
        processedSteps: steps.length,
        totalWritten,
        steps,
        limits,
        matrix: await getMatrix(supabaseAdmin),
        summary: await buildSummary(supabaseAdmin),
      });
    }

    return json({
      ok: true,
      limits: await loadLimits(supabaseAdmin),
      matrix: await getMatrix(supabaseAdmin),
      summary: await buildSummary(supabaseAdmin),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ ok: false, error: message }, 500);
  }
});
