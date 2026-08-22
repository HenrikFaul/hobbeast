import { SafetyActions } from '@/components/safety/SafetyActions';

interface CommunityResourceSafetyActionProps {
  resourceType: 'circle' | 'hub';
  resourceId: string;
  hostUserId?: string | null;
}

export function CommunityResourceSafetyAction({
  resourceType,
  resourceId,
  hostUserId,
}: CommunityResourceSafetyActionProps) {
  return (
    <SafetyActions
      targetType={resourceType}
      targetRef={resourceId}
      targetUserId={hostUserId || null}
      sourceSurface={`community_${resourceType}_card`}
      className="border-t pt-2"
    />
  );
}
