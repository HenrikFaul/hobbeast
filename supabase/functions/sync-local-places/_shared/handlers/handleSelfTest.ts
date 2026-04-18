import { MILESTONES } from '../constants/sync.ts';
import { buildTasks } from '../tasks/buildTasks.ts';

type AppendLog = (level: 'info' | 'warn' | 'error' | 'success', event: string, message: string, details?: Record<string, unknown>, runId?: string) => Promise<string | null>;

type TestResult = { ok: boolean; [key: string]: unknown };

async function testLogWrite(appendLog: AppendLog, runId: string): Promise<TestResult> {
  try {
    const err = await appendLog('info', 'SELF_TEST_LOG_WRITE', 'Self-test: log write probe', { probe: true }, runId);
    return err ? { ok: false, error: err } : { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function testStateRead(supabaseAdmin: any): Promise<TestResult> {
  try {
    const { data, error } = await supabaseAdmin
      .from('place_sync_state')
      .select('key, status, cursor, task_count')
      .eq('key', 'local_places')
      .maybeSingle();
    if (error) return { ok: false, error: error.message, code: error.code };
    return { ok: true, has_row: data !== null, row: data };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function testConfigRead(supabaseAdmin: any): Promise<TestResult> {
  try {
    const { data, error } = await supabaseAdmin
      .from('app_runtime_config')
      .select('key, provider')
      .limit(3);
    if (error) return { ok: false, error: error.message, code: error.code };
    return { ok: true, row_count: data?.length ?? 0, rows: data };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function testCatalogRead(supabaseAdmin: any): Promise<TestResult> {
  try {
    const { count, error } = await supabaseAdmin
      .from('places_local_catalog')
      .select('id', { count: 'exact', head: true });
    if (error) return { ok: false, error: error.message, code: error.code };
    return { ok: true, total_rows: count ?? 0 };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function testCatalogWrite(supabaseAdmin: any, runId: string): Promise<TestResult> {
  const testExternalId = `self-test-probe-${runId}`;
  try {
    const { error: insertErr } = await supabaseAdmin
      .from('places_local_catalog')
      .insert({
        provider: 'manual_test',
        external_id: testExternalId,
        name: 'Self-Test Probe Row',
        category_group: 'test',
        categories: [],
        address: null,
        city: 'Budapest',
        district: null,
        postal_code: null,
        country_code: 'HU',
        latitude: 47.4979,
        longitude: 19.0402,
        open_now: null,
        rating: null,
        review_count: null,
        image_url: null,
        phone: null,
        website: null,
        opening_hours_text: [],
        metadata: { self_test: true, run_id: runId },
        synced_at: new Date().toISOString(),
      });
    if (insertErr) return { ok: false, phase: 'insert', error: insertErr.message, code: insertErr.code };

    const { error: deleteErr } = await supabaseAdmin
      .from('places_local_catalog')
      .delete()
      .eq('provider', 'manual_test')
      .eq('external_id', testExternalId);
    if (deleteErr) return { ok: false, phase: 'delete', error: deleteErr.message, code: deleteErr.code };

    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function testEnvKeys(): TestResult {
  const geoapify = Deno.env.get('GEOAPIFY_API_KEY');
  const tomtom = Deno.env.get('TOMTOM_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  return {
    ok: Boolean(geoapify && tomtom),
    geoapify_key: geoapify ? 'present' : 'MISSING',
    tomtom_key: tomtom ? 'present' : 'MISSING',
    supabase_url: supabaseUrl ? 'present' : 'MISSING',
    service_role_key: serviceKey ? 'present' : 'MISSING',
  };
}

function testTaskBuild(): TestResult {
  try {
    const tasks = buildTasks();
    return { ok: true, total_tasks: tasks.length };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function handleSelfTest(
  supabaseAdmin: any,
  appendLog: AppendLog,
  runId: string,
) {
  await appendLog('info', MILESTONES.SELF_TEST_STARTED, 'Self-test started — probing each layer', {}, runId);

  const [logWrite, stateRead, configRead, catalogRead, catalogWrite] = await Promise.all([
    testLogWrite(appendLog, runId),
    testStateRead(supabaseAdmin),
    testConfigRead(supabaseAdmin),
    testCatalogRead(supabaseAdmin),
    testCatalogWrite(supabaseAdmin, runId),
  ]);

  const envKeys = testEnvKeys();
  const taskBuild = testTaskBuild();

  const results = {
    log_write: logWrite,
    state_read: stateRead,
    config_read: configRead,
    catalog_read: catalogRead,
    catalog_write: catalogWrite,
    env_keys: envKeys,
    task_build: taskBuild,
  };

  const allOk = Object.values(results).every((r) => r.ok !== false);

  await appendLog(
    allOk ? 'success' : 'warn',
    MILESTONES.SELF_TEST_DONE,
    allOk ? 'All self-test probes passed' : 'Some self-test probes failed — see results',
    { results: results as unknown as Record<string, unknown> },
    runId,
  );

  return { ok: allOk, run_id: runId, self_test: results };
}
