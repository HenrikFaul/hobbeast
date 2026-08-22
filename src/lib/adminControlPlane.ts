export const ADMIN_OPERATOR_ROLES = [
  'support',
  'moderator',
  'content_ops',
  'organizer_ops',
  'finance_ops',
  'security_admin',
  'super_admin',
] as const;

export type AdminOperatorRole = (typeof ADMIN_OPERATOR_ROLES)[number];

export const ADMIN_CAPABILITIES = [
  'health.view',
  'users.search_masked',
  'users.manage_profile',
  'users.suspend',
  'moderation.manage',
  'content.manage',
  'organizers.manage',
  'hubs.manage',
  'ai_proposals.manage',
  'notifications.manage',
  'providers.manage',
  'finance.manage',
  'feature_flags.manage',
  'operations.assign',
  'operations.resolve',
  'audit.view',
  'security.manage',
  'bulk.destructive',
  'approvals.decide',
] as const;

export type AdminCapability = (typeof ADMIN_CAPABILITIES)[number];

export function isAdminCapability(value: unknown): value is AdminCapability {
  return typeof value === 'string' && ADMIN_CAPABILITIES.includes(value as AdminCapability);
}

export function canAccessAdminControlPlane(capabilities: readonly AdminCapability[]) {
  return capabilities.includes('health.view');
}

const ROLE_CAPABILITIES: Record<AdminOperatorRole, readonly AdminCapability[]> = {
  support: ['health.view', 'users.search_masked', 'operations.assign', 'audit.view'],
  moderator: ['health.view', 'users.search_masked', 'moderation.manage', 'operations.assign', 'operations.resolve', 'audit.view'],
  content_ops: ['health.view', 'content.manage', 'hubs.manage', 'ai_proposals.manage', 'operations.assign', 'operations.resolve', 'audit.view'],
  organizer_ops: ['health.view', 'users.search_masked', 'organizers.manage', 'operations.assign', 'operations.resolve', 'audit.view'],
  finance_ops: ['health.view', 'finance.manage', 'operations.assign', 'operations.resolve', 'audit.view'],
  security_admin: ['health.view', 'users.search_masked', 'users.suspend', 'moderation.manage', 'operations.assign', 'operations.resolve', 'audit.view', 'security.manage', 'approvals.decide'],
  super_admin: ADMIN_CAPABILITIES,
};

export function roleHasCapability(role: AdminOperatorRole, capability: AdminCapability) {
  return ROLE_CAPABILITIES[role].includes(capability);
}

const SAFE_ADMIN_LINKS = [
  '/admin', '/admin?tab=users', '/admin?tab=events', '/admin?tab=auto-events',
  '/admin?tab=eventbrite', '/admin?tab=moderation', '/admin?tab=operations',
] as const;

export function sanitizeAdminDeepLink(value: unknown) {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (!candidate.startsWith('/admin') || candidate.startsWith('//') || candidate.includes('\\')) return null;
  if ([...candidate].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  })) return null;
  let parsed: URL;
  try {
    parsed = new URL(candidate, 'https://hobbeast.invalid');
  } catch {
    return null;
  }
  if (parsed.origin !== 'https://hobbeast.invalid' || parsed.pathname !== '/admin') return null;
  const tab = parsed.searchParams.get('tab');
  if (!tab) return '/admin';
  const allowed = SAFE_ADMIN_LINKS.find((link) => link === `/admin?tab=${tab}`);
  return allowed || null;
}

const SENSITIVE_KEY = /(?:email|phone|address|birth|token|secret|password|authorization|cookie|latitude|longitude|lat|lon|ip)$/i;

export function redactAdminAuditValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[MAX_DEPTH]';
  if (Array.isArray(value)) return value.slice(0, 50).map((entry) => redactAdminAuditValue(entry, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 100).map(([key, entry]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactAdminAuditValue(entry, depth + 1),
    ]));
  }
  if (typeof value === 'string') return value.slice(0, 1000);
  return value;
}

export type OperationState = 'open' | 'acknowledged' | 'in_progress' | 'blocked' | 'resolved' | 'dismissed';

const OPERATION_TRANSITIONS: Record<OperationState, readonly OperationState[]> = {
  open: ['acknowledged', 'in_progress', 'dismissed'],
  acknowledged: ['in_progress', 'blocked', 'resolved', 'dismissed'],
  in_progress: ['blocked', 'resolved', 'dismissed'],
  blocked: ['in_progress', 'resolved', 'dismissed'],
  resolved: ['open'],
  dismissed: ['open'],
};

export function canTransitionOperation(from: OperationState, to: OperationState) {
  return OPERATION_TRANSITIONS[from].includes(to);
}

export function operationSlaState(slaTarget: string, nowIso: string) {
  const target = Date.parse(slaTarget);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(target) || !Number.isFinite(now)) return 'unknown' as const;
  const remaining = target - now;
  if (remaining < 0) return 'breached' as const;
  if (remaining <= 60 * 60 * 1000) return 'at_risk' as const;
  return 'healthy' as const;
}

export function highRiskConfirmationMatches(action: string, targetId: string, confirmation: unknown) {
  if (typeof confirmation !== 'string' || !action.trim() || !targetId.trim()) return false;
  return confirmation.trim() === `CONFIRM ${action.trim().toUpperCase()} ${targetId.trim()}`;
}

export function maskAdminSearchText(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  if (text.includes('@')) {
    const [local, domain] = text.split('@');
    return `${local.slice(0, 2)}***@${domain?.replace(/^[^.]+/, '***') || '***'}`;
  }
  if (text.length <= 3) return `${text[0] || ''}**`;
  return `${text.slice(0, 2)}***${text.slice(-1)}`;
}
