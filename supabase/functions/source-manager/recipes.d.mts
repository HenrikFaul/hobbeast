// Type surface for the shared recipe engine (plain ESM, generated copy).
export interface RecipeSample {
  title: string;
  date: string;
  time: string | null;
  url: string | null;
  location: string | null;
}

export interface RecipeCandidate {
  strategy: string;
  id: string;
  label: string;
  hint: string;
  needsBrowser: boolean;
  unsupported?: boolean;
  endpointUrl: string;
  eventCount: number;
  samples: RecipeSample[];
  evidence: string;
  confidence: number;
}

export interface InspectResult {
  url: string | null;
  homepageUrl: string | null;
  publisherName: string | null;
  candidates: RecipeCandidate[];
  warnings: string[];
}

export interface RecipeFetchResult {
  ok: boolean;
  status: number;
  text: string;
  contentType: string;
}

export function inspectSource(
  url: string,
  options: { fetchText: (url: string) => Promise<RecipeFetchResult>; maxDetailFetches?: number },
): Promise<InspectResult>;

export function normalizeSourceUrl(input: string): string | null;
export function isSocialUrl(url: string): boolean;
export function guessPublisherName(html: string, url: string): string | null;

export interface ExtractionRule {
  version?: number;
  container: string;
  fields: Record<string, { selector?: string; attr?: string }>;
  dateFormat?: 'auto' | 'hu' | 'iso';
  limit?: number;
}

export interface RuleEvent {
  name: string;
  startDate: string;
  url: string | null;
  description: string | null;
  image: string | null;
  location: string | null;
  city: string | null;
  offers: { price_min?: number; currency?: string };
}

export function validateRule(rule: unknown): { ok: boolean; errors: string[] };
export function extractWithRule(
  html: string,
  rule: unknown,
  pageUrl: string,
): { events: RuleEvent[]; errors: string[] };
export function sampleRepeatingBlock(
  html: string,
  options?: { maxChars?: number },
): { snippet: string; hintSelector: string | null; candidates: Array<{ selector: string; occurrences: number }> };
