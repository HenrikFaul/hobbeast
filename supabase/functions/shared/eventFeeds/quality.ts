import { classifyEventCategory } from './categories.ts';
import { cleanXmlText, normalizeSearchText, normalizeUrl, stableId, truncate } from './text.ts';
import {
  EVENT_FEED_LIMITS,
  type EventFeedCandidate,
  type EventFeedQualityDecision,
  type EventFeedQualityReason,
  type ParsedEventFeedItem,
} from './types.ts';

function evaluateQuality(
  item: Omit<ParsedEventFeedItem, 'quality'>,
  now: Date,
  blockers: EventFeedQualityReason[] = [],
): EventFeedQualityDecision {
  const reasons: EventFeedQualityReason[] = [...new Set(blockers)];
  if (!item.title) reasons.push('missing_title');

  if (!item.startAt) {
    reasons.push('missing_start');
  } else {
    const start = new Date(item.startAt);
    if (Number.isNaN(start.getTime())) reasons.push('invalid_start');
    else if (start.getTime() <= now.getTime()) reasons.push('not_future');
  }

  if (!item.url || !item.url.startsWith('https://')) reasons.push('missing_https_url');
  if (!item.location.online && !item.location.name && !item.location.address && !item.location.city) {
    reasons.push('missing_location');
  }
  if (!item.category) reasons.push('missing_category');
  if (item.status === 'cancelled') reasons.push('cancelled');

  return {
    publishable: reasons.length === 0,
    score: Math.max(0, 100 - reasons.length * 20),
    reasons,
  };
}

export function normalizeEventCandidate(
  candidate: EventFeedCandidate,
  context: {
    sourceId: string;
    sourceUrl: string;
    now: Date;
    sourceCity?: string | null;
    sourceCategories?: string[] | null;
  },
): ParsedEventFeedItem {
  const title = cleanXmlText(candidate.title, EVENT_FEED_LIMITS.maxTitleChars);
  const description = cleanXmlText(candidate.description, EVENT_FEED_LIMITS.maxDescriptionChars) || null;
  const sourceCategories = [...new Set([
    ...(candidate.sourceCategories ?? []),
    ...(context.sourceCategories ?? []),
  ]
    .map((category) => cleanXmlText(category, 120))
    .filter(Boolean))]
    .slice(0, EVENT_FEED_LIMITS.maxTags);
  const classification = classifyEventCategory([
    title,
    description,
    ...sourceCategories,
    ...(candidate.classificationText ?? []),
  ]);
  const url = normalizeUrl(candidate.url, context.sourceUrl);
  const imageUrl = normalizeUrl(candidate.imageUrl, context.sourceUrl);
  const recurrenceId = cleanXmlText(candidate.recurrenceId, 256) || null;
  const suppliedId = cleanXmlText(candidate.externalId, 512);
  const externalId = suppliedId || stableId([
    context.sourceId,
    title,
    candidate.startAt ?? '',
    url ?? '',
    recurrenceId ?? '',
  ].join('|'));

  const categorySearchTags = sourceCategories
    .map((category) => normalizeSearchText(category).replace(/\s+/g, '-'))
    .filter(Boolean);
  const itemWithoutQuality: Omit<ParsedEventFeedItem, 'quality'> = {
    sourceId: context.sourceId,
    format: candidate.format,
    externalId: truncate(externalId, 512),
    recurrenceId,
    title,
    description,
    url,
    imageUrl,
    startAt: candidate.startAt ?? null,
    endAt: candidate.endAt ?? null,
    publishedAt: candidate.publishedAt ?? null,
    status: candidate.status ?? 'scheduled',
    organizerName: cleanXmlText(candidate.organizerName, 256) || null,
    location: {
      name: cleanXmlText(candidate.location?.name, 256) || null,
      address: cleanXmlText(candidate.location?.address, 512) || null,
      city: cleanXmlText(candidate.location?.city, 160)
        || cleanXmlText(context.sourceCity, 160)
        || null,
      online: candidate.location?.online === true,
    },
    category: classification.category,
    tags: [...new Set([
      ...classification.tags,
      ...(classification.category ? [classification.category] : []),
      ...categorySearchTags,
    ])].slice(0, EVENT_FEED_LIMITS.maxTags),
    sourceCategories,
  };

  return {
    ...itemWithoutQuality,
    quality: evaluateQuality(itemWithoutQuality, context.now, candidate.qualityBlockers),
  };
}
