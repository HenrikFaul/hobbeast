export interface CreateCircleInput {
  name: string;
  purpose: string;
  cadence: string;
  capacity: number;
  membershipPolicy: string;
  visibility: string;
  safetyRules: string;
  creationKey: string;
}

export function buildCreateCircleCommand(input: CreateCircleInput) {
  return {
    _name: input.name.trim(),
    _purpose: input.purpose.trim(),
    _cadence: input.cadence,
    _capacity: Math.max(2, Math.min(50, Math.round(input.capacity))),
    _membership_policy: input.membershipPolicy,
    _visibility: input.visibility,
    _safety_rules: input.safetyRules.trim(),
    _creation_key: input.creationKey,
  };
}

export function buildHubJoinCommand(userId: string, hubId: string, acknowledged: boolean) {
  return {
    _hub_id: hubId,
    _acknowledge_rules: acknowledged,
    _idempotency_key: `hub-join:${userId}:${hubId}`,
  };
}
