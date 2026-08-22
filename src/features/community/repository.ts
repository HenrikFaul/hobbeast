import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { trackProductEvent } from '@/lib/productAnalyticsClient';
import { buildCreateCircleCommand, buildHubJoinCommand, type CreateCircleInput } from './commands';
import type {
  CircleCard,
  CircleDetail,
  CircleHealth,
  CircleSuggestionCard,
  CommunitySnapshot,
  CommunitySurface,
  ConnectionCard,
  DomainMutationErrorCode,
  DomainMutationResult,
  HubCard,
  HubHostInsights,
  HubModerationItem,
  HubPendingRequest,
  HubWelcome,
  ReconnectionCard,
} from './contracts';

interface RuntimeRpcClient {
  rpc<T>(name: string, args?: Record<string, unknown>): Promise<{
    data: T | null;
    error: PostgrestError | null;
  }>;
}

const runtimeRpcClient = supabase as unknown as RuntimeRpcClient;

function normalizeMutationError(error: Pick<PostgrestError, 'code'> | null): DomainMutationErrorCode | null {
  if (!error) return null;
  if (error.code === '42501' || error.code === 'PGRST301') return 'FORBIDDEN';
  if (error.code === '23505' || error.code === '409') return 'CONFLICT';
  if (error.code === '22023' || error.code === '23514') return 'VALIDATION';
  return 'UNAVAILABLE';
}

function mutationResult<T>(data: T, error: PostgrestError | null): DomainMutationResult<T> {
  const code = normalizeMutationError(error);
  return code ? { ok: false, code } : { ok: true, data };
}

export async function loadCommunitySnapshot(userId: string): Promise<CommunitySnapshot> {
  const [connectionsFlag, circlesFlag, hubFlag] = await Promise.all([
    supabase.rpc('feature_enabled_for_subject', { _flag_key: 'connections', _subject_id: userId }),
    supabase.rpc('feature_enabled_for_subject', { _flag_key: 'circles', _subject_id: userId }),
    supabase.rpc('feature_enabled_for_subject', { _flag_key: 'hub2', _subject_id: userId }),
  ]);
  const availability = {
    connections: connectionsFlag.data === true && !connectionsFlag.error,
    circles: circlesFlag.data === true && !circlesFlag.error,
    hub2: hubFlag.data === true && !hubFlag.error,
    registryAvailable: !connectionsFlag.error && !circlesFlag.error && !hubFlag.error,
  };
  const emptyResult = { data: [], error: null } as const;
  let suggestions: { data: CircleSuggestionCard[] | null; error: PostgrestError | null } = emptyResult;
  if (availability.circles) {
    await runtimeRpcClient.rpc('expire_my_social_graph_records');
    suggestions = await runtimeRpcClient.rpc<CircleSuggestionCard[]>('get_my_circle_suggestion_cards');
    if (!suggestions.error && (suggestions.data || []).length === 0) {
      await runtimeRpcClient.rpc('refresh_my_circle_suggestions');
      suggestions = await runtimeRpcClient.rpc<CircleSuggestionCard[]>('get_my_circle_suggestion_cards');
    }
  }
  const [reconnections, connections, preferences, circles, memberships, hubs] = await Promise.all([
    availability.connections ? supabase.rpc('get_my_reconnection_candidates') : Promise.resolve(emptyResult),
    availability.connections ? supabase.rpc('get_my_connection_cards') : Promise.resolve(emptyResult),
    availability.connections
      ? supabase.from('reconnection_preferences').select('encounter_id,decision').eq('user_id', userId).is('revoked_at', null)
      : Promise.resolve(emptyResult),
    availability.circles
      ? supabase
          .from('social_circles')
          .select('id,host_id,name,purpose,cadence,capacity,membership_policy,lifecycle_state,safety_rules,visibility')
          .neq('lifecycle_state', 'archived')
          .order('updated_at', { ascending: false })
      : Promise.resolve(emptyResult),
    availability.circles
      ? supabase.from('social_circle_members').select('circle_id,membership_status').eq('user_id', userId)
      : Promise.resolve(emptyResult),
    availability.hub2
      ? runtimeRpcClient.rpc<HubCard[]>('get_my_virtual_hub_cards')
      : Promise.resolve(emptyResult),
  ]);

  const unavailableSurfaces: CommunitySurface[] = [];
  if (reconnections.error) unavailableSurfaces.push('reconnections');
  if (connections.error) unavailableSurfaces.push('connections');
  if (preferences.error) unavailableSurfaces.push('preferences');
  if (circles.error) unavailableSurfaces.push('circles');
  if (suggestions.error) unavailableSurfaces.push('suggestions');
  if (memberships.error) unavailableSurfaces.push('memberships');
  if (hubs.error) unavailableSurfaces.push('hubs');

  const hubCards = ((hubs.data || []) as HubCard[]).filter((hub) => Boolean(hub.id));
  if (availability.hub2) {
    void Promise.all(hubCards.slice(0, 12).map((hub) => recordVirtualHubDiscovery(hub.id, userId)));
  }

  return {
    reconnections: (reconnections.data || []) as ReconnectionCard[],
    connections: (connections.data || []) as ConnectionCard[],
    preferences: new Map((preferences.data || []).map((item) => [item.encounter_id, item.decision])),
    circles: (circles.data || []) as CircleCard[],
    suggestions: suggestions.data || [],
    memberships: new Map((memberships.data || []).map((item) => [item.circle_id, item.membership_status])),
    hubs: hubCards,
    availability,
    unavailableSurfaces,
  };
}

export async function setReconnectionPreference(encounterId: string, decision: 'interested' | 'pass') {
  const { data, error } = await supabase.rpc('set_reconnection_preference', {
    _encounter_id: encounterId,
    _decision: decision,
  });
  const result = mutationResult(data, error);
  if (result.ok && decision === 'interested') {
    void trackProductEvent('reconnection_sent', { surface: 'community', status: 'interested' });
    if (data) void trackProductEvent('reconnection_mutual', { surface: 'community', status: 'connected' });
  }
  return result;
}

export async function revokeCommunityConnection(connectionId: string) {
  const { error } = await supabase.rpc('revoke_connection', { _connection_id: connectionId });
  return mutationResult(undefined, error);
}

export async function createCommunityCircle(input: CreateCircleInput) {
  const { data, error } = await supabase.rpc('create_social_circle', buildCreateCircleCommand(input));
  const result = mutationResult(data, error);
  if (result.ok) void trackProductEvent('circle_created', { surface: 'community', status: 'draft' });
  return result;
}

export async function requestCircleMembership(circleId: string, acknowledged: boolean) {
  const { data, error } = await supabase.rpc('request_circle_membership', {
    _circle_id: circleId,
    _acknowledge_rules: acknowledged,
  });
  const result = mutationResult(data, error);
  if (result.ok && data === 'active') void trackProductEvent('circle_joined', { surface: 'community', status: 'active' });
  return result;
}

export async function transitionCommunityCircle(circleId: string, nextState: string) {
  const { data, error } = await supabase.rpc('transition_social_circle', {
    _circle_id: circleId,
    _next_state: nextState,
    _reason: 'Host community workspace transition',
  });
  return mutationResult(data, error);
}

export async function respondToCircleMembership(circleId: string, accept: boolean, acknowledged: boolean) {
  const { data, error } = await supabase.rpc('respond_to_circle_membership', {
    _circle_id: circleId,
    _accept: accept,
    _acknowledge_rules: acknowledged,
  });
  const result = mutationResult(data, error);
  if (result.ok && accept) void trackProductEvent('circle_joined', { surface: 'community', status: 'active' });
  return result;
}

export async function requestVirtualHubJoin(userId: string, hubId: string, acknowledged: boolean) {
  const { data, error } = await supabase.rpc('request_virtual_hub_join', buildHubJoinCommand(userId, hubId, acknowledged));
  return mutationResult(data, error);
}

export async function inviteCommunityCircleMember(circleId: string, userId: string) {
  const { data, error } = await supabase.rpc('invite_circle_member', {
    _circle_id: circleId,
    _user_id: userId,
  });
  return mutationResult(data, error);
}

export async function leaveCommunityCircle(circleId: string) {
  const { data, error } = await runtimeRpcClient.rpc<string>('leave_social_circle', {
    _circle_id: circleId,
    _reason: 'Member left from community workspace',
  });
  return mutationResult(data, error);
}

export async function loadCircleDetail(circleId: string) {
  const { data, error } = await runtimeRpcClient.rpc<CircleDetail>('get_circle_detail', {
    _circle_id: circleId,
  });
  return mutationResult(data, error);
}

export async function loadCircleHealth(circleId: string) {
  const { data, error } = await runtimeRpcClient.rpc<CircleHealth>('get_circle_health', {
    _circle_id: circleId,
  });
  return mutationResult(data, error);
}

export async function resolveCircleMembershipRequest(
  circleId: string,
  userId: string,
  approve: boolean,
) {
  const { data, error } = await runtimeRpcClient.rpc<string>('resolve_circle_membership_request', {
    _circle_id: circleId,
    _user_id: userId,
    _approve: approve,
    _reason: approve ? 'Approved by Circle host' : 'Declined by Circle host',
  });
  return mutationResult(data, error);
}

export async function acceptCommunityCircleSuggestion(
  suggestionId: string,
  activityLabel: string,
) {
  const { data, error } = await runtimeRpcClient.rpc<string>('accept_circle_suggestion', {
    _suggestion_id: suggestionId,
    _name: `${activityLabel} Circle`,
    _purpose: `Újabb közös ${activityLabel.toLocaleLowerCase('hu-HU')} programok szervezése.`,
    _creation_key: `suggestion:${suggestionId}`,
  });
  const result = mutationResult(data, error);
  if (result.ok) void trackProductEvent('circle_created', { surface: 'circle_suggestion', status: 'recruiting' });
  return result;
}

export async function loadVirtualHubPendingRequests(hubId: string) {
  const { data, error } = await runtimeRpcClient.rpc<HubPendingRequest[]>('get_virtual_hub_pending_requests', {
    _hub_id: hubId,
  });
  return mutationResult(data || [], error);
}

export async function resolveVirtualHubJoinRequest(
  moderationItemId: string,
  approve: boolean,
) {
  const { data, error } = await runtimeRpcClient.rpc<Record<string, unknown>>('resolve_virtual_hub_join_request', {
    _moderation_item_id: moderationItemId,
    _approve: approve,
    _reason: approve ? 'Approved by Hub host' : 'Declined by Hub host',
    _idempotency_key: `hub-resolution:${moderationItemId}:${approve ? 'approve' : 'decline'}`,
  });
  return mutationResult(data, error);
}

export async function claimVirtualHubHost(hubId: string, userId: string) {
  const { data, error } = await runtimeRpcClient.rpc<Record<string, unknown>>('claim_virtual_hub_host', {
    _hub_id: hubId,
    _idempotency_key: `hub-host-claim:${hubId}:${userId}`,
  });
  return mutationResult(data, error);
}

export async function requestVirtualHubReactivation(hubId: string, userId: string) {
  const { data, error } = await runtimeRpcClient.rpc<string>('request_virtual_hub_reactivation', {
    _hub_id: hubId,
    _reason: 'A member is ready to organize the next community activity',
    _idempotency_key: `hub-reactivation:${hubId}:${userId}`,
  });
  return mutationResult(data, error);
}

export async function recordVirtualHubPreview(hubId: string, userId: string) {
  const dayBucket = new Date().toISOString().slice(0, 10);
  const { data, error } = await runtimeRpcClient.rpc('record_virtual_hub_activation', {
    _hub_id: hubId,
    _stage: 'preview',
    _dedupe_key: `hub-preview:${hubId}:${userId}:${dayBucket}`,
  });
  return mutationResult(data, error);
}

export async function recordVirtualHubDiscovery(hubId: string, userId: string) {
  const dayBucket = new Date().toISOString().slice(0, 10);
  const { data, error } = await runtimeRpcClient.rpc('record_virtual_hub_activation', {
    _hub_id: hubId,
    _stage: 'discovery',
    _dedupe_key: `hub-discovery:${hubId}:${userId}:${dayBucket}`,
  });
  return mutationResult(data, error);
}

export async function loadVirtualHubWelcome(hubId: string) {
  const { data, error } = await runtimeRpcClient.rpc<HubWelcome>('get_virtual_hub_welcome', {
    _hub_id: hubId,
  });
  return mutationResult(data, error);
}

export async function loadVirtualHubHostInsights(hubId: string) {
  const { data, error } = await runtimeRpcClient.rpc<HubHostInsights>('get_virtual_hub_host_insights', {
    _hub_id: hubId,
  });
  return mutationResult(data, error);
}

export async function loadVirtualHubModerationQueue(hubId: string) {
  const { data, error } = await runtimeRpcClient.rpc<HubModerationItem[]>('get_virtual_hub_moderation_queue', {
    _hub_id: hubId,
  });
  return mutationResult(data || [], error);
}

export async function resolveVirtualHubModerationItem(
  moderationItemId: string,
  action: 'review' | 'resolve' | 'dismiss',
) {
  const { data, error } = await runtimeRpcClient.rpc<Record<string, unknown>>('resolve_virtual_hub_moderation_item', {
    _moderation_item_id: moderationItemId,
    _action: action,
    _reason: action === 'review'
      ? 'Hub host started review'
      : action === 'resolve'
        ? 'Hub host resolved the queue item'
        : 'Hub host dismissed the queue item',
    _idempotency_key: `hub-moderation:${moderationItemId}:${action}`,
  });
  return mutationResult(data, error);
}
