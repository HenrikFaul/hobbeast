import type { LocationRef, UnresolvedLocationRef } from '@/lib/tripPlanningSchema';

export interface TripPointProposal {
  id: string;
  source: 'ai_agent' | 'automation_rule' | 'manual_helper';
  proposalType: 'start' | 'end' | 'waypoint';
  candidate: LocationRef | UnresolvedLocationRef;
  rationale?: string[];
  confidence?: number;
  status: 'proposed' | 'accepted' | 'rejected';
}

export interface RouteAlternativeProposal {
  id: string;
  basedOnRequestId: string;
  routeType: string;
  proposedWaypoints: TripPointProposal[];
  expectedLengthM?: number;
  expectedDurationS?: number;
  rationale?: string[];
  status: 'proposed' | 'accepted' | 'rejected';
}

export function createTripPointProposal(input: Omit<TripPointProposal, 'id' | 'status'>): TripPointProposal {
  return { id: crypto.randomUUID(), status: 'proposed', ...input };
}

export function acceptRouteAlternative(chosenId: string, alternatives: RouteAlternativeProposal[]): RouteAlternativeProposal[] {
  return alternatives.map((alternative) => ({
    ...alternative,
    status: alternative.id === chosenId ? 'accepted' : 'rejected',
  }));
}

export function getAcceptedAlternative(alternatives: RouteAlternativeProposal[]): RouteAlternativeProposal | null {
  return alternatives.find((alternative) => alternative.status === 'accepted') ?? null;
}
