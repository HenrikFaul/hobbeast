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
      // RFC 9309 group selection is a case-insensitive product-token match,
      // not a prefix match (e.g. "Hobbeast" must not capture HobbeastBot).
      const specificity = agent === '*' ? 0 : product === agent ? agent.length : -1;
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

const UNRESERVED_ASCII = /^[A-Za-z0-9._~-]$/;

function percentEncoded(byte: number) {
  return `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
}

function canonicalComparisonPath(value: string, preserveWildcard: boolean) {
  let result = '';
  for (let index = 0; index < value.length;) {
    const encoded = /^%([0-9a-f]{2})/i.exec(value.slice(index));
    if (encoded) {
      const byte = Number.parseInt(encoded[1], 16);
      const character = String.fromCharCode(byte);
      result += UNRESERVED_ASCII.test(character) ? character : percentEncoded(byte);
      index += 3;
      continue;
    }

    const codePoint = value.codePointAt(index) ?? 0;
    const character = String.fromCodePoint(codePoint);
    if (codePoint > 0x7f) {
      for (const byte of new TextEncoder().encode(character)) result += percentEncoded(byte);
    } else if (character === '*' && !preserveWildcard) {
      result += '%2A';
    } else if (character === '$') {
      result += '%24';
    } else {
      result += character;
    }
    index += character.length;
  }
  return result;
}

function normalizedPath(path: string) {
  try {
    const parsed = new URL(path, 'https://robots.invalid');
    return canonicalComparisonPath(`${parsed.pathname}${parsed.search}` || '/', false);
  } catch {
    return canonicalComparisonPath(path.startsWith('/') ? path : `/${path}`, false);
  }
}

function escapeRegex(value: string) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function ruleMatches(pattern: string, path: string) {
  const anchored = pattern.endsWith('$');
  const withoutAnchor = anchored ? pattern.slice(0, -1) : pattern;
  const canonicalPattern = canonicalComparisonPath(withoutAnchor, true);
  const regexSource = canonicalPattern.split('*').map(escapeRegex).join('.*');
  try {
    return new RegExp(`^${regexSource}${anchored ? '$' : ''}`).test(path);
  } catch {
    return false;
  }
}

function ruleSpecificity(pattern: string) {
  const anchored = pattern.endsWith('$');
  const canonical = canonicalComparisonPath(anchored ? pattern.slice(0, -1) : pattern, true).replace(/\*/g, '');
  let octets = 0;
  for (let index = 0; index < canonical.length;) {
    if (/^%[0-9A-F]{2}/.test(canonical.slice(index))) index += 3;
    else index += 1;
    octets += 1;
  }
  return octets;
}

export function evaluateRobotsTxt(body: string, userAgent: string, path: string): RobotsDecision {
  const matches = matchingGroups(parseGroups(body), userAgent);
  if (matches.length === 0) {
    return { allowed: true, matchedUserAgent: null, matchedRule: null, reason: 'no_matching_rule' };
  }

  const requestPath = normalizedPath(path);
  if (requestPath === '/robots.txt' || requestPath.startsWith('/robots.txt?')) {
    return { allowed: true, matchedUserAgent: null, matchedRule: null, reason: 'no_matching_rule' };
  }
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
