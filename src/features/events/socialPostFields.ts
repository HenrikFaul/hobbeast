/**
 * Reading the labelled lines of a social post.
 *
 * Hungarian event posts label their facts two ways, and the collector has to
 * understand both:
 *
 *   📍 Helyszín: Chill Island Club     ← an emoji AND a word
 *   📍 Ráckeve – Kis-Duna              ← the emoji IS the label
 *
 * The second shape is why a real advert came through with an empty venue: the
 * emoji was stripped as decoration before anything looked at it, and with no
 * "Helyszín:" left there was nothing to match. Here the emoji is read first
 * and only then removed.
 *
 * Every pattern below comes from a post someone actually wrote, not from
 * imagination — which is why the lists are long and slightly repetitive.
 */

export type PostField =
  | 'date' | 'time' | 'venue' | 'address' | 'price' | 'phone'
  | 'url' | 'email' | 'organizer' | 'registration' | 'age' | 'ticket';

/** The emoji that stand in for a label, by what they label. */
const EMOJI_FIELD: Array<{ field: PostField; emoji: string[] }> = [
  { field: 'date', emoji: ['📅', '🗓', '🗓️', '📆'] },
  { field: 'time', emoji: ['⏰', '🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛', '⌚', '⏱'] },
  // 🌍 and 🗺 are left out on purpose: posts open marketing lines with them
  // as often as they mark a place, and a wrong venue is worse than none.
  { field: 'venue', emoji: ['📍', '🏠', '🏡', '🏢', '🏛'] },
  { field: 'price', emoji: ['💰', '💵', '💸', '💶', '🪙'] },
  { field: 'ticket', emoji: ['🎟', '🎟️', '🎫'] },
  { field: 'phone', emoji: ['📞', '☎', '☎️', '📱'] },
  { field: 'url', emoji: ['🌐', '🔗', '💻', '🖥'] },
  { field: 'email', emoji: ['✉', '✉️', '📧', '📨'] },
  { field: 'organizer', emoji: ['👤', '🧑', '🏋', '🎪'] },
  { field: 'registration', emoji: ['📝', '✍', '✍️', '📋'] },
];

/**
 * Word labels, in Hungarian and the English that Hungarian pages often mix in.
 * Ordered longest-first inside each field so "kezdési időpont" wins over
 * "időpont" and does not leave a stray word behind.
 */
const WORD_LABELS: Array<{ field: PostField; words: string[] }> = [
  { field: 'date', words: ['időpont', 'idopont', 'dátum', 'datum', 'mikor', 'date', 'when'] },
  { field: 'time', words: ['kezdés', 'kezdes', 'kapunyitás', 'kapunyitas', 'kezdési időpont', 'start', 'time'] },
  { field: 'venue', words: ['helyszín', 'helyszin', 'hol', 'venue', 'location', 'where', 'place'] },
  { field: 'address', words: ['cím', 'cim', 'address'] },
  { field: 'price', words: ['részvételi díj', 'reszveteli dij', 'belépő', 'belepo', 'jegyár', 'jegyar', 'ár', 'ar', 'díj', 'dij', 'price', 'fee', 'ticket'] },
  { field: 'phone', words: ['telefon', 'tel', 'mobil', 'phone'] },
  { field: 'url', words: ['weboldal', 'honlap', 'web', 'link', 'bővebben', 'bovebben', 'info', 'információ', 'informacio', 'website'] },
  { field: 'email', words: ['email', 'e-mail', 'levél', 'level'] },
  { field: 'organizer', words: ['szervező', 'szervezo', 'rendező', 'rendezo', 'házigazda', 'hazigazda', 'oktató', 'oktato', 'előadó', 'eloado', 'organizer', 'host'] },
  { field: 'registration', words: ['jelentkezés', 'jelentkezes', 'regisztráció', 'regisztracio', 'foglalás', 'foglalas', 'nevezés', 'nevezes', 'registration'] },
  { field: 'age', words: ['korhatár', 'korhatar', 'életkor', 'eletkor', 'age'] },
];

const EMOJI_RE = /\p{Extended_Pictographic}|️|[←-⇿⬀-⯿]/gu;

/** Strips emoji and list bullets once their meaning has been taken. */
export function stripDecoration(line: string): string {
  return line
    .replace(EMOJI_RE, ' ')
    .replace(/^[\s•·▪▫◆◇–—>*+\-–—]+/, '')
    .replace(/[\s•·▪▫◆◇]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function foldForLabel(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Whether a bare, emoji-introduced line reads as a value rather than prose.
 * "📍 Ráckeve – Kis-Duna" is a place; "🌍 Pattanj motorcsónakba, és fedezd fel
 * a Kis-Duna varázslatos világát!" is a sentence that happens to start with an
 * emoji, and reading it as the venue is worse than finding no venue at all.
 */
function plausibleValue(value: string): boolean {
  if (!value || value.length > 90) return false;
  if (value.split(/\s+/).length > 12) return false;
  if (/[?!]$/.test(value)) return false;
  // Two clauses joined by a comma and a verb ending is prose, not a place.
  if (/,\s+\p{Ll}+(?:d|sz|unk|tek|nak|nek)\b/u.test(value) && value.includes(',')) return false;
  return true;
}

export interface LabelledLine {
  /** What the line is about, if it says so. */
  field: PostField | null;
  /** The line with its label and decoration removed. */
  value: string;
  /** The line with only decoration removed — the label kept. */
  text: string;
  /** True when a word label was found, not merely an emoji. */
  explicit: boolean;
}

/**
 * Reads one line: what it is about, and what it says.
 *
 * A word label beats an emoji, because "📍 Időpont: 18:00" is about the time
 * however unhelpfully it is decorated.
 */
export function readLine(rawLine: string): LabelledLine {
  const line = String(rawLine || '');

  let emojiField: PostField | null = null;
  for (const entry of EMOJI_FIELD) {
    if (entry.emoji.some((emoji) => line.includes(emoji))) {
      emojiField = entry.field;
      break;
    }
  }

  const bare = stripDecoration(line);
  const folded = foldForLabel(bare);

  for (const entry of WORD_LABELS) {
    for (const word of [...entry.words].sort((a, b) => b.length - a.length)) {
      const foldedWord = foldForLabel(word);
      // The label must open the line and be followed by a colon or a dash;
      // "a helyszínen fizethetsz" is prose, not a label.
      const pattern = new RegExp(`^${foldedWord}\\s*[:：\\-–—]\\s*(.+)$`);
      const match = folded.match(pattern);
      if (!match) continue;
      // Slice from the ORIGINAL so accents and capitals survive the match.
      const value = bare.slice(bare.length - match[1].length).trim();
      return { field: entry.field, value, text: bare, explicit: true };
    }
  }

  if (emojiField && !plausibleValue(bare)) {
    return { field: null, value: bare, text: bare, explicit: false };
  }
  return { field: emojiField, value: bare, text: bare, explicit: false };
}
