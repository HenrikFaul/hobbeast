export interface RobotsDecision {
  allowed: boolean;
  matchedUserAgent: string | null;
  matchedRule: string | null;
  reason: 'rule' | 'no_matching_rule' | 'robots_unavailable' | 'robots_temporary_failure';
}

interface RobotsGroup {
  userAgents: string[];
  rules: RobotsRule[];
}

interface RobotsRule {
  directive: 'allow' | 'disallow';
  pattern: string;
}

function withoutComment(line: string) {
  const comment = line.indexOf('#');
  return (comment >= 0 ? line.slice(0, comment) : line).trim();
}

function parseGroups(body: string) {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let currentHasRules = false;

  for (const rawLine of body.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = withoutComment(rawLine);
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === 'user-agent') {
      if (!value) continue;
      if (!current || currentHasRules) {
        current = { userAgents: [], rules: [] };
        groups.push(current);
        currentHasRules = false;
      }
      current.userAgents.push(value.toLowerCase());
      continue;
    }

    if ((field === 'allow' || field === 'disallow') && current) {
      currentHasRules = true;
      // An empty Disallow value has no effect; an empty Allow cannot make a
      // path more permissive than the default and is ignored as well.
      if (value) current.rules.push({ directive: field, pattern: value });
    }
  }
  return groups;
}

function productToken(userAgent: string) {
  return userAgent.trim().toLowerCase().split(/[\s/]/, 1)[0] || '';
}

function matchingGroups(groups: RobotsGroup[], userAgent: string) {
  const product = productToken(userAgent);
  let bestSpecificity = -1;
  const matches: Array<{ group: RobotsGroup; matchedAgent: string }> = [];

  for (const group of groups) {
    for (const agent of group.userAgents) {
      const specificity = agent === '*' ? 0 : product.startsWith(agent) ? agent.length : -1;
      if (specificity < 0) continue;
      if (specificity > bestSpecificity) {
        matches.length = 0;
        bestSpecificity = specificity;
      }
      if (specificity === bestSpecificity) matches.push({ group, matchedAgent: agent });
    }
  }
  return matches;
}

function normalizedPath(path: string) {
  try {
    const parsed = new URL(path, 'https://robots.invalid');
    return `${parsed.pathname}${parsed.search}` || '/';
  } catch {
    return path.startsWith('/') ? path : `/${path}`;
  }
}

function escapeRegex(value: string) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function ruleMatches(pattern: string, path: string) {
  const anchored = pattern.endsWith('$');
  const withoutAnchor = anchored ? pattern.slice(0, -1) : pattern;
  const regexSource = withoutAnchor.split('*').map(escapeRegex).join('.*');
  try {
    return new RegExp(`^${regexSource}${anchored ? '$' : ''}`).test(path);
  } catch {
    return false;
  }
}

function ruleSpecificity(pattern: string) {
  return pattern.replace(/\*/g, '').replace(/\$$/, '').length;
}

export function evaluateRobotsTxt(body: string, userAgent: string, path: string): RobotsDecision {
  const matches = matchingGroups(parseGroups(body), userAgent);
  if (matches.length === 0) {
    return { allowed: true, matchedUserAgent: null, matchedRule: null, reason: 'no_matching_rule' };
  }

  const requestPath = normalizedPath(path);
  let winning: { rule: RobotsRule; specificity: number; matchedAgent: string } | null = null;
  for (const { group, matchedAgent } of matches) {
    for (const rule of group.rules) {
      if (!ruleMatches(rule.pattern, requestPath)) continue;
      const specificity = ruleSpecificity(rule.pattern);
      if (
        !winning
        || specificity > winning.specificity
        || (specificity === winning.specificity && rule.directive === 'allow' && winning.rule.directive === 'disallow')
      ) {
        winning = { rule, specificity, matchedAgent };
      }
    }
  }

  if (!winning) {
    return {
      allowed: true,
      matchedUserAgent: matches[0]?.matchedAgent ?? null,
      matchedRule: null,
      reason: 'no_matching_rule',
    };
  }
  return {
    allowed: winning.rule.directive === 'allow',
    matchedUserAgent: winning.matchedAgent,
    matchedRule: `${winning.rule.directive}:${winning.rule.pattern}`,
    reason: 'rule',
  };
}

export function evaluateRobotsResponse(
  httpStatus: number,
  body: string,
  userAgent: string,
  path: string,
): RobotsDecision {
  if (httpStatus >= 200 && httpStatus < 300) return evaluateRobotsTxt(body, userAgent, path);
  if (httpStatus >= 500 || httpStatus === 429) {
    return {
      allowed: false,
      matchedUserAgent: null,
      matchedRule: null,
      reason: 'robots_temporary_failure',
    };
  }
  if (httpStatus >= 400 && httpStatus < 500) {
    return {
      allowed: true,
      matchedUserAgent: null,
      matchedRule: null,
      reason: 'robots_unavailable',
    };
  }
  return {
    allowed: false,
    matchedUserAgent: null,
    matchedRule: null,
    reason: 'robots_temporary_failure',
  };
}
