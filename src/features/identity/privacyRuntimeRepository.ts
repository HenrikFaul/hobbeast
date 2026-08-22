import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { FirstEventConfidenceRecord } from './firstEventConfidence';

interface RuntimeRpcClient {
  rpc<T>(name: string, args?: Record<string, unknown>): Promise<{
    data: T | null;
    error: PostgrestError | null;
  }>;
}

const runtimeRpcClient = supabase as unknown as RuntimeRpcClient;

export interface DataSubjectRequestResult {
  request_id: string;
  status: string;
  idempotent_replay: boolean;
  grace_period_ends_at: string | null;
}

export async function loadMyFirstEventConfidence() {
  return runtimeRpcClient.rpc<FirstEventConfidenceRecord>('get_my_first_event_confidence');
}

export async function saveMyFirstEventConfidence(payload: Record<string, unknown>, clear = false) {
  return runtimeRpcClient.rpc<{ status: string; idempotent_replay: boolean }>(
    'save_my_first_event_confidence',
    { _payload: payload, _clear: clear },
  );
}

export async function requestMyDataSubjectAction(
  requestType: 'export' | 'deletion',
  exportScope: string[],
  idempotencyKey: string,
) {
  return runtimeRpcClient.rpc<DataSubjectRequestResult>('request_my_data_subject_action_v2', {
    _request_type: requestType,
    _export_scope: exportScope,
    _idempotency_key: idempotencyKey,
  });
}

export async function prepareMyDataExport(requestId: string) {
  return runtimeRpcClient.rpc<Record<string, unknown>>('prepare_my_data_export', {
    _request_id: requestId,
  });
}

export const DATA_EXPORT_SCOPES = [
  { value: 'profile', label: 'Profil és helybeállítások' },
  { value: 'preferences', label: 'Érdeklődések és részvételi preferenciák' },
  { value: 'events', label: 'Eseményrészvételek' },
  { value: 'social', label: 'Circle-, Hub- és kapcsolati állapotok' },
  { value: 'account_activity', label: 'Fiók- és eszközaktivitás' },
] as const;

export function buildDataRequestIdempotencyKey(
  userId: string,
  requestType: 'export' | 'deletion',
  now = new Date(),
) {
  return `data-subject:${requestType}:${userId}:${now.toISOString().slice(0, 16)}`;
}

export function downloadJsonExport(payload: Record<string, unknown>, now = new Date()) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `hobbeast-data-export-${now.toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
