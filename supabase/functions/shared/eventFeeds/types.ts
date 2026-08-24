export interface EventFeedLimits {
  maxBodyBytes: number;
  maxItems: number;
  maxTitleChars: number;
  maxDescriptionChars: number;
  maxFieldChars: number;
  maxTags: number;
}

export const EVENT_FEED_LIMITS: Readonly<EventFeedLimits> = {
  maxBodyBytes: 2 * 1024 * 1024,
  maxItems: 200,
  maxTitleChars: 240,
  maxDescriptionChars: 4_000,
  maxFieldChars: 1_024,
  maxTags: 12,
};

export type EventFeedFormat = 'rss' | 'atom' | 'ics' | 'json-ld' | 'html';

export const HOBBEAST_CATEGORY_IDS = [
  'sport',
  'extreme',
  'nature',
  'creative',
  'music',
  'dance',
  'board-games',
  'gaming',
  'gastronomy',
  'photo-film',
  'tech',
  'learning',
  'animals',
  'travel',
  'fashion',
  'volunteering',
  'performing-arts',
] as const;

export type HobbeastCategoryId = typeof HOBBEAST_CATEGORY_IDS[number];

export interface EventFeedLocation {
  name: string | null;
  address: string | null;
  city: string | null;
  online: boolean;
}

export type EventFeedStatus = 'scheduled' | 'cancelled';

export type EventFeedQualityReason =
  | 'missing_title'
  | 'missing_start'
  | 'invalid_start'
  | 'not_future'
  | 'missing_https_url'
  | 'missing_location'
  | 'missing_category'
  | 'missing_timezone'
  | 'cancelled';

export interface EventFeedQualityDecision {
  publishable: boolean;
  score: number;
  reasons: EventFeedQualityReason[];
}

export interface ParsedEventFeedItem {
  sourceId: string;
  format: Exclude<EventFeedFormat, 'html'>;
  externalId: string;
  recurrenceId: string | null;
  title: string;
  description: string | null;
  url: string | null;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  publishedAt: string | null;
  status: EventFeedStatus;
  organizerName: string | null;
  location: EventFeedLocation;
  category: HobbeastCategoryId | null;
  tags: string[];
  sourceCategories: string[];
  quality: EventFeedQualityDecision;
}

export interface EventFeedCandidate {
  format: Exclude<EventFeedFormat, 'html'>;
  externalId?: string | null;
  recurrenceId?: string | null;
  title?: string | null;
  description?: string | null;
  url?: string | null;
  imageUrl?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  publishedAt?: string | null;
  status?: EventFeedStatus;
  organizerName?: string | null;
  location?: Partial<EventFeedLocation> | null;
  sourceCategories?: string[];
  classificationText?: string[];
  qualityBlockers?: EventFeedQualityReason[];
}

export interface EventFeedParseContext {
  sourceId: string;
  sourceUrl: string;
  contentType?: string | null;
  now?: Date;
  sourceTimezone?: string | null;
  sourceCity?: string | null;
  sourceCategories?: string[] | null;
  limits?: Partial<Pick<EventFeedLimits, 'maxBodyBytes' | 'maxItems'>>;
}

export interface EventFeedParseResult {
  format: EventFeedFormat;
  events: ParsedEventFeedItem[];
  discoveredFeedUrls: string[];
  warnings: string[];
  /** True when the body implements a supported event or event-discovery contract. */
  recognizedEventContract?: boolean;
  /** True only when the parser recognized a complete structured event collection contract. */
  recognizedCollection?: boolean;
}

export class EventFeedParseError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'body_too_large'
      | 'unsafe_xml'
      | 'malformed_xml'
      | 'unsupported_format'
      | 'malformed_payload',
  ) {
    super(message);
    this.name = 'EventFeedParseError';
  }
}
