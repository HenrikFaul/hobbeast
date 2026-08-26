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
