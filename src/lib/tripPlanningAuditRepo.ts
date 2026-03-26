import { supabase } from '@/integrations/supabase/client';
import type { TripPlanningAuditRecord } from '@/lib/tripPlanningAudit';

export async function persistTripPlanningAudit(record: Omit<TripPlanningAuditRecord, 'id'>) {
  const { error } = await (supabase as any).from('trip_planning_audits').insert({
    request_id: record.requestId,
    caller_type: record.callerType,
    caller_id: record.callerId ?? null,
    event_id: record.eventId ?? null,
    started_at: record.startedAt,
    finished_at: record.finishedAt ?? null,
    status: record.status,
    route_type: record.routeType ?? null,
    provider: record.provider,
    request_summary: record.requestSummary,
    chosen_alternative_id: record.chosenAlternativeId ?? null,
    warnings: record.warnings ?? null,
    error_code: record.errorCode ?? null,
    correlation_id: record.correlationId ?? null,
  });
  if (error) throw error;
}
