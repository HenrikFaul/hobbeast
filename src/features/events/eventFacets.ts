import type { EventData } from '@/features/events/discoveryModel';
import { normalizeText } from '@/features/events/discoveryModel';

/**
 * Facets that answer the questions a person actually asks before choosing a
 * programme — "megy már valaki?", "van most valami idénybeli?", "olyat
 * szeretnék, amit nem lehet egyedül csinálni" — rather than the questions a
 * database can answer cheaply.
 *
 * All three read only fields the catalogue already carries, so they work the
 * same for a Hobbeast event and for a collected external programme.
 */
export type VibeFacet = 'has_signups' | 'seasonal' | 'group';

export interface VibeFacetMeta {
  key: VibeFacet;
  label: string;
  /** Shown under the chip when the facet is on: what it actually selects. */
  blurb: string;
}

/** The searchable text of a programme: title, tags and the category path. */
function haystack(event: EventData) {
  return normalizeText([
    event.title,
    event.category,
    ...(event.tags || []),
  ].filter(Boolean).join(' '));
}

// ---------------------------------------------------------------------------
// 1. Már vannak résztvevők
// ---------------------------------------------------------------------------

/**
 * Somebody has already committed. For a Hobbeast event that is a participant;
 * for an external programme it is a companion plan — a member who said they
 * are going and would like company. Both mean the same thing to the reader:
 * you would not be the first.
 */
export function eventHasSignups(event: EventData) {
  return (event.participant_count ?? 0) > 0 || (event.companion_count ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// 2. Szezonális
// ---------------------------------------------------------------------------

export interface SeasonWindow {
  key: string;
  label: string;
  /** Inclusive window as [month, day], 1-based month. May wrap the year. */
  from: [number, number];
  to: [number, number];
  pattern: RegExp;
}

/**
 * The Hungarian programme year. A window says WHEN a season is on; the pattern
 * says WHAT belongs to it.
 *
 * Both halves are required, and that is the point: December does not make a
 * cinema screening seasonal, and the word "karácsonyi" in July is either a typo
 * or a joke. Only a programme that names its season, inside that season, is
 * offered here. Windows are generous because several of these feasts move with
 * the calendar (farsang and húsvét follow Easter), and a generous window with a
 * strict pattern is the safer of the two errors.
 *
 * Text is matched normalized (accents folded), so `karacsony` catches
 * "Karácsonyi", "karácsony", "KARÁCSONY".
 */
export const SEASONS: readonly SeasonWindow[] = [
  {
    key: 'farsang',
    label: 'Farsang és busójárás',
    from: [1, 6], to: [3, 5],
    pattern: /farsang|buso|maskara|jelmez|telkerget|teluzo|kiszebab|maszkos/,
  },
  {
    key: 'tel',
    label: 'Téli szezon',
    from: [12, 1], to: [2, 28],
    pattern: /korcsolya|jegpalya|szanko|sieles|sipalya|sitabor|snowboard|jegvarazs/,
  },
  {
    key: 'husvet',
    label: 'Húsvéti időszak',
    from: [3, 1], to: [4, 30],
    pattern: /husvet|locsol|tojasfest|tojas\b|nyuszi|kikelet|zold csutortok/,
  },
  {
    key: 'majalis',
    label: 'Majális és pünkösd',
    from: [4, 20], to: [6, 20],
    pattern: /majalis|majusfa|punkosd|gyereknap|madarak es fak|tavaszi fesztival/,
  },
  {
    key: 'nyar',
    label: 'Nyári fesztiválszezon',
    from: [6, 1], to: [8, 31],
    pattern: /fesztival|strand|szabadteri|open ?air|nyari|tabor\b|kemping|camping|vizi\b|napfelkelte|szabadteri mozi|kerti mulatsag|balatoni/,
  },
  {
    key: 'szuret',
    label: 'Szüret és termésünnep',
    from: [8, 20], to: [10, 31],
    pattern: /szuret|bornap|borfesztival|ujbor|termesunnep|szureti|tokfesztival|almaszed/,
  },
  {
    key: 'halloween',
    label: 'Halloween és mindenszentek',
    from: [10, 10], to: [11, 5],
    pattern: /halloween|tokfarag|toklampas|ijeszt|horror|kisertet|mindenszentek/,
  },
  {
    key: 'marton',
    label: 'Márton-nap',
    from: [11, 1], to: [11, 20],
    pattern: /marton ?nap|martonnapi|libator|liba\b|ujborkostol/,
  },
  {
    key: 'advent',
    label: 'Advent és karácsony',
    from: [11, 15], to: [12, 27],
    pattern: /advent|karacsony|betlehem|mezeskalacs|forralt ?bor|mikulas|fenyo|adventi vasar|kirakodovasar|luca/,
  },
  {
    key: 'szilveszter',
    label: 'Szilveszter és újév',
    from: [12, 20], to: [1, 8],
    pattern: /szilveszter|ujevi|tuzijatek|vizkereszt/,
  },
];

function dayOfYearIndex(month: number, day: number) {
  return month * 100 + day;
}

function withinWindow(season: SeasonWindow, month: number, day: number) {
  const point = dayOfYearIndex(month, day);
  const from = dayOfYearIndex(season.from[0], season.from[1]);
  const to = dayOfYearIndex(season.to[0], season.to[1]);
  // A window like 20 Dec → 8 Jan wraps around the new year.
  return from <= to ? point >= from && point <= to : point >= from || point <= to;
}

/** Every season that is on for a given calendar day. They deliberately overlap. */
export function seasonsForDate(date: Date): SeasonWindow[] {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return SEASONS.filter((season) => withinWindow(season, month, day));
}

function parseEventDate(event: EventData): Date | null {
  if (!event.event_date) return null;
  const parsed = new Date(`${event.event_date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Seasonal means: the programme names a season, AND it happens while that
 * season is on. Judged by the programme's OWN date — a Christmas market in
 * December is seasonal whether you browse it in November or on the day.
 */
export function eventSeason(event: EventData, today: Date = new Date()): SeasonWindow | null {
  const when = parseEventDate(event) ?? today;
  const text = haystack(event);
  return seasonsForDate(when).find((season) => season.pattern.test(text)) ?? null;
}

export function isSeasonalEvent(event: EventData, today: Date = new Date()) {
  return eventSeason(event, today) !== null;
}

/** What the seasonal filter is offering right now, for the chip's label. */
export function currentSeasonLabel(today: Date = new Date()): string | null {
  const active = seasonsForDate(today);
  if (!active.length) return null;
  return active.map((season) => season.label).join(' · ');
}

// ---------------------------------------------------------------------------
// 3. Közösségi programok
// ---------------------------------------------------------------------------

/**
 * Programmes that only work with other people.
 *
 * The test is not "would it be nicer with friends" — almost everything would.
 * It is "does this fall apart alone": a football match needs two sides, a board
 * game night needs players, a partner dance needs a partner, a group hike or a
 * dog-walking meetup IS the group. A film screening, a concert or an exhibition
 * does not qualify, however sociable it feels: one person with one ticket has a
 * complete evening.
 *
 * Each rule carries the reason it fired, so the card can say why it is here.
 */
const GROUP_RULES: Array<[RegExp, string]> = [
  // "torna" is gymnastics as often as it is a tournament, so it is left out.
  [/foci|futball|kosarlabda|roplabda|kezilabda|vizilabda|jegkorong|floorball|ultimate|rogbi|baseball|csapatsport|meccs|bajnoksag/,
    'Csapatjáték – nem áll össze egy fővel.'],
  [/tarsasjatek|tarsasozas|kartyajatek|kartyaest|sakk|szabaduloszoba|szabadulo szoba|kviz|pub ?quiz|rejtvenyest|szerepjatek|dnd|dungeons/,
    'Játékhoz partnerek kellenek.'],
  // Without the word boundary "kultura" contains "tura", and every culture
  // programme would be filed as a group hike.
  [/\btura|\bturaz|kirandul|teljesitmenytura|varosi seta|futoklub|futokor|kerekparos tura|biciklis tura|evezes|kajak|raftin/,
    'Közösen indul: a csapat maga a program.'],
  [/kutyasetaltat|kutyas seta|kutyasuli|kutyaz/,
    'Kutyás közösségi alkalom.'],
  [/salsa|bachata|kizomba|swing|tango|keringo|paros tanc|tanchaz|tancest/,
    'Páros tánc – partner nélkül nem megy.'],
  // Not "zenekar" or "kórus": in a programme title those name the performers,
  // and the audience of a concert is not a team. Only the formats where the
  // visitor is the one playing count.
  [/jam ?session|kozos enekles|kozos zenel|dobkor|drum ?circle|enekkari proba/,
    'Együtt szól: közös zenélés.'],
  [/onkentes|kozossegi kert|szemetszed|takaritas akcio|adomanygyujt|veradas|epito tabor/,
    'Önkéntes akció – sok kézre van szükség.'],
  [/kozos foz|fozocsapat|fozoverseny|grillparti|piknik|kozos vacsora|kozos reggeli|supper ?club/,
    'Közös asztal, közös főzés.'],
  [/csapatepit|csapatverseny|valto\b|parban|csoportos|kozossegi program|meetup|klubdelutan/,
    'Kifejezetten csoportos formátum.'],
];

/**
 * Formats where one ticket buys one complete evening. When the TITLE says the
 * programme is one of these, no category keyword may pull it in: the
 * collector's category is a guess, the organiser's own title is not. This is
 * what keeps a stand-up night filed under "Társasjáték" upstream out of the
 * group filter.
 */
const SPECTATOR_TITLE = /stand-?up|filmvetit|filmklub|mozi\b|koncert|eloadas|kiallitas|tarlat|szinhaz|operett|opera\b|felolvas/;

/**
 * Why this programme counts as a group activity, or null if it does not.
 * A joint visit organised on Hobbeast always counts: people have literally
 * arranged to go together.
 */
export function groupActivityReason(event: EventData): string | null {
  if ((event.companion_count ?? 0) > 0) return 'Közös látogatás szerveződött rá.';
  if (SPECTATOR_TITLE.test(normalizeText(event.title))) return null;
  const text = haystack(event);
  for (const [pattern, reason] of GROUP_RULES) {
    if (pattern.test(text)) return reason;
  }
  return null;
}

export function isGroupEvent(event: EventData) {
  return groupActivityReason(event) !== null;
}

// ---------------------------------------------------------------------------

export function vibeFacetMeta(facet: VibeFacet, today: Date = new Date()): VibeFacetMeta {
  switch (facet) {
    case 'has_signups':
      return {
        key: facet,
        label: 'Már vannak résztvevők',
        blurb: 'Csak azok a programok, amelyekre már jelezte valaki, hogy megy — nem te leszel az első.',
      };
    case 'seasonal': {
      const season = currentSeasonLabel(today);
      return {
        key: facet,
        label: season ? `Szezonális · ${season}` : 'Szezonális',
        blurb: season
          ? `Az évszakhoz kötődő programok: ${season.toLocaleLowerCase('hu-HU')}. A mindig futó programok (mozi, stand-up) nem tartoznak ide.`
          : 'Az évszakhoz kötődő programok. Épp nincs aktív szezon, ezért ez a szűrő most keveset mutat.',
      };
    }
    case 'group':
    default:
      return {
        key: 'group',
        label: 'Közösségi programok',
        blurb: 'Amit nem lehet egyedül csinálni: csapatjáték, túra, páros tánc, közös főzés, önkéntes akció.',
      };
  }
}

export function eventMatchesVibeFacets(
  event: EventData,
  facets: ReadonlySet<VibeFacet>,
  today: Date = new Date(),
) {
  if (facets.size === 0) return true;
  if (facets.has('has_signups') && !eventHasSignups(event)) return false;
  if (facets.has('seasonal') && !isSeasonalEvent(event, today)) return false;
  if (facets.has('group') && !isGroupEvent(event)) return false;
  return true;
}
