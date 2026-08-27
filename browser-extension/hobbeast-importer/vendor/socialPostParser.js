// GENERATED from src/features/events/socialPostParser.ts by scripts/sync-extension-parser.mjs — do not edit.
const HU_MONTHS = {
  januar: 1,
  februar: 2,
  marcius: 3,
  aprilis: 4,
  majus: 5,
  junius: 6,
  julius: 7,
  augusztus: 8,
  szeptember: 9,
  oktober: 10,
  november: 11,
  december: 12
};
const WEEKDAY_RECURRENCE = /(hetfonk|keddenk|szerdank|csutortokonk|pentekenk|szombatonk|vasarnaponk|minden\s+(hetfo|kedd|szerda|csutortok|pentek|szombat|vasarnap))/;
function foldHu(value) {
  return value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function monthOf(word) {
  const folded = foldHu(word);
  for (const [key, num] of Object.entries(HU_MONTHS)) {
    if (folded.startsWith(key.slice(0, 3)) && key.startsWith(folded.slice(0, 3))) return num;
  }
  return null;
}
function iso(year, month, day) {
  if (!year || !month || !day || month > 12 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function resolveYear(month, day, today) {
  const year = today.getFullYear();
  const candidate = new Date(Date.UTC(year, month - 1, day));
  const cutoff = today.getTime() - 32 * 864e5;
  return candidate.getTime() < cutoff ? year + 1 : year;
}
function cleanLine(line) {
  return line.replace(/\p{Extended_Pictographic}|️|[←-⇿⬀-⯿]/gu, " ").replace(/^[\s•·▪◆–—>*-]+/, "").replace(/\s+/g, " ").trim();
}
function findDates(text, today) {
  const folded = foldHu(text);
  const numeric = [...folded.matchAll(/(20\d{2})[.\-/]\s?(\d{1,2})[.\-/]\s?(\d{1,2})/g)].map((match) => iso(Number(match[1]), Number(match[2]), Number(match[3]))).filter((value) => Boolean(value));
  if (numeric.length) {
    return { start: numeric[0], end: numeric[1] && numeric[1] !== numeric[0] ? numeric[1] : null };
  }
  const spanWithYear = folded.match(/(20\d{2})\.?\s*([a-z]{3,10})\s*(\d{1,2})\s*[-–—]\s*(\d{1,2})\b/);
  if (spanWithYear) {
    const month = monthOf(spanWithYear[2]);
    if (month) {
      return {
        start: iso(Number(spanWithYear[1]), month, Number(spanWithYear[3])),
        end: iso(Number(spanWithYear[1]), month, Number(spanWithYear[4]))
      };
    }
  }
  const withYear = folded.match(/(20\d{2})\.?\s*([a-z]{3,10})\.?\s*(\d{1,2})\b/);
  if (withYear) {
    const month = monthOf(withYear[2]);
    if (month) return { start: iso(Number(withYear[1]), month, Number(withYear[3])), end: null };
  }
  const span = folded.match(/\b([a-z]{3,10})\.?\s*(\d{1,2})\s*[-–—]\s*(\d{1,2})\b/);
  if (span) {
    const month = monthOf(span[1]);
    if (month) {
      const year = resolveYear(month, Number(span[2]), today);
      return { start: iso(year, month, Number(span[2])), end: iso(year, month, Number(span[3])) };
    }
  }
  const single = folded.match(/\b([a-z]{3,10})\.?\s*(\d{1,2})(?:-?[aeá]n|-?[eé]n|\.)?\b/);
  if (single) {
    const month = monthOf(single[1]);
    if (month) {
      const day = Number(single[2]);
      return { start: iso(resolveYear(month, day, today), month, day), end: null };
    }
  }
  return { start: null, end: null };
}
function findTimes(text) {
  const withoutDates = text.replace(/20\d{2}[.\-/]\s?\d{1,2}[.\-/]\s?\d{1,2}\.?/g, " ").replace(/\b20\d{2}\b/g, " ");
  const times = [...withoutDates.matchAll(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/g)].map((match) => `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`);
  if (!times.length) return { start: null, end: null };
  return { start: times[0], end: times[1] && times[1] !== times[0] ? times[1] : null };
}
const LABELLED = [
  { key: "venue", pattern: /(?:^|\n)[^\n]*?helysz[ií]n\s*[:：]\s*([^\n]+)/i },
  { key: "price", pattern: /(?:^|\n)[^\n]*?(?:r[eé]szv[eé]teli\s+d[ií]j|bel[eé]p[oő]|[aá]r)\s*[:：]\s*([^\n]+)/i }
];
function labelled(text, key) {
  const rule = LABELLED.find((entry) => entry.key === key);
  const match = rule ? text.match(rule.pattern) : null;
  return match ? cleanLine(match[1]) || null : null;
}
function findTitle(lines) {
  for (const line of lines) {
    const clean = cleanLine(line);
    if (clean.length < 6 || clean.length > 110) continue;
    if (/[:：]\s*$/.test(clean)) continue;
    if (/[?!]$/.test(clean)) continue;
    if (clean.split(/\s+/).length > 14) continue;
    if (/^(https?:|www\.)/i.test(clean)) continue;
    return clean;
  }
  return null;
}
function parseSocialPost(input, today = /* @__PURE__ */ new Date()) {
  const text = String(input || "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const folded = foldHu(text);
  const warnings = [];
  const dates = findDates(text, today);
  const times = findTimes(text);
  const url = text.match(/https?:\/\/[^\s)<>"']+/)?.[0] || (text.match(/\b(?:www\.)[a-z0-9-]+\.[a-z]{2,}[^\s)<>"']*/i)?.[0] ? `https://${text.match(/\b(?:www\.)[a-z0-9-]+\.[a-z]{2,}[^\s)<>"']*/i)?.[0]}` : null);
  const phone = text.match(/(\+36[\s\d/-]{7,}|\b06[\s\d/-]{7,})/)?.[0]?.trim() || null;
  const venue = labelled(text, "venue");
  const priceText = labelled(text, "price");
  const address = text.match(/\b(\d{4})\s+([A-ZÁÉÍÓÖŐÚÜŰ][^\n,]{2,40}),\s*([^\n]{4,60})/)?.[0] || null;
  const city = address?.match(/\b\d{4}\s+([A-ZÁÉÍÓÖŐÚÜŰ][\wÁÉÍÓÖŐÚÜŰáéíóöőúüű-]+)/)?.[1] || text.match(/\b(Budapest|Debrecen|Szeged|P[eé]cs|Gy[oő]r|Miskolc|Kecskem[eé]t|Sz[eé]kesfeh[eé]rv[aá]r|Veszpr[eé]m|R[aá]ckeve|Velence|G[oö]d)\b/)?.[1] || null;
  const free = /ingyenes|d[ií]jmentes|a r[eé]szv[eé]tel ingyenes/i.test(text);
  const paid = /\b\d{3,6}\s?(ft|huf)\b/i.test(text) || /bel[eé]p[oő]\s*[:：]/i.test(text);
  const recurring = WEEKDAY_RECURRENCE.test(folded);
  if (!dates.start) warnings.push("Nem tal\xE1ltam d\xE1tumot \u2014 add meg k\xE9zzel.");
  if (!times.start && !recurring) warnings.push("Nem tal\xE1ltam kezd\xE9si id\u0151pontot.");
  if (!venue && !address) warnings.push("Nem tal\xE1ltam helysz\xEDnt.");
  if (recurring) warnings.push("Ez ism\xE9tl\u0151d\u0151 alkalomnak t\u0171nik \u2014 lehet, hogy ink\xE1bb klubk\xE9nt \xE9rdemes felvenni.");
  if (free && paid) warnings.push("A poszt ingyeness\xE9get \xE9s \xE1rat is eml\xEDt \u2014 n\xE9zd \xE1t.");
  return {
    title: findTitle(lines),
    eventDate: dates.start,
    endDate: dates.end,
    eventTime: times.start,
    endTime: times.end,
    venue,
    city,
    address,
    isFree: free && !paid ? true : paid ? false : null,
    priceText,
    registrationRequired: /regisztr[aá]ci[oó]|jelentkez[eé]s|foglal[aá]s|bejelentkez[eé]s/i.test(text),
    url,
    phone,
    recurring,
    description: text.trim().slice(0, 4e3),
    warnings
  };
}
export {
  foldHu,
  parseSocialPost
};
