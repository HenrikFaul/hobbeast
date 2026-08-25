import fs from "node:fs/promises";

const source = JSON.parse(await fs.readFile("./source-preview/Munkalap1.values.json", "utf8"));
const analysis = JSON.parse(await fs.readFile("./source-analysis.json", "utf8"));
const [, ...rows] = source.values;

const blockedSequences = new Set([
  ...analysis.exactDuplicates.flatMap((group) => group.slice(1).map((row) => String(row.sequence))),
  ...analysis.ambiguousMetadata.map((row) => String(row.sequence)),
  ...analysis.highSensitivity.map((row) => String(row.sequence)),
]);

const normalize = (value) => String(value ?? "")
  .normalize("NFKD")
  .replace(/\p{M}+/gu, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim()
  .replace(/\s+/g, " ");

const tokens = (value) => new Set(normalize(value).split(" ").filter((token) => token.length > 1));
const jaccard = (left, right) => {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size && !b.size) return 1;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
};

const candidatesByTitle = new Map();
for (const row of rows) {
  if (blockedSequences.has(String(row[0]))) continue;
  const key = normalize(row[2]);
  if (!candidatesByTitle.has(key)) {
    candidatesByTitle.set(key, { publication: row[2], authors: row[3], year: row[4], sequences: [] });
  }
  candidatesByTitle.get(key).sequences.push(row[0]);
}

const candidates = [...candidatesByTitle.values()];
const results = new Array(candidates.length);
let nextIndex = 0;

const fetchWithRetry = async (url) => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "HobbeastLiteratureAudit/1.0 (https://expericentre.com)",
      },
    });
    if (response.ok) return response.json();
    if (![429, 500, 502, 503, 504].includes(response.status)) {
      throw new Error(`Crossref ${response.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 800 * (2 ** attempt)));
  }
  throw new Error("Crossref retry budget exhausted");
};

const worker = async () => {
  while (true) {
    const index = nextIndex;
    nextIndex += 1;
    if (index >= candidates.length) return;
    const candidate = candidates[index];
    const params = new URLSearchParams({
      "query.title": candidate.publication,
      rows: "3",
      select: "DOI,title,author,published-print,published-online,issued,URL,type,publisher,container-title",
    });
    try {
      const data = await fetchWithRetry(`https://api.crossref.org/works?${params}`);
      const items = data?.message?.items ?? [];
      const ranked = items.map((item) => {
        const matchedTitle = item.title?.[0] ?? "";
        const titleScore = jaccard(candidate.publication, matchedTitle);
        const issuedYear = item.issued?.["date-parts"]?.[0]?.[0]
          ?? item["published-print"]?.["date-parts"]?.[0]?.[0]
          ?? item["published-online"]?.["date-parts"]?.[0]?.[0]
          ?? null;
        const requestedYear = Number(String(candidate.year).match(/\d{4}/)?.[0] ?? NaN);
        const yearDelta = Number.isFinite(requestedYear) && issuedYear ? Math.abs(requestedYear - issuedYear) : null;
        const requestedSurnames = normalize(candidate.authors).split(" ").filter((token) => token.length > 3);
        const indexedAuthors = normalize((item.author ?? []).map((author) => `${author.given ?? ""} ${author.family ?? ""}`).join(" "));
        const authorHit = requestedSurnames.some((surname) => indexedAuthors.includes(surname));
        return {
          titleScore: Number(titleScore.toFixed(3)),
          yearDelta,
          authorHit,
          doi: item.DOI ?? null,
          url: item.URL ?? null,
          title: matchedTitle,
          authors: item.author ?? [],
          year: issuedYear,
          type: item.type ?? null,
          publisher: item.publisher ?? null,
          containerTitle: item["container-title"]?.[0] ?? null,
        };
      }).sort((a, b) =>
        b.titleScore - a.titleScore
        || Number(b.authorHit) - Number(a.authorHit)
        || (a.yearDelta ?? 9999) - (b.yearDelta ?? 9999)
      );
      const best = ranked[0] ?? null;
      results[index] = {
        ...candidate,
        best,
        verified: Boolean(best && best.titleScore >= 0.84 && best.authorHit && (best.yearDelta === null || best.yearDelta <= 1)),
      };
    } catch (error) {
      results[index] = { ...candidate, best: null, verified: false, error: String(error) };
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
};

await Promise.all([worker(), worker()]);
await fs.writeFile("./crossref-verification.json", JSON.stringify(results, null, 2), "utf8");
console.log(JSON.stringify({
  titles: results.length,
  verified: results.filter((row) => row.verified).length,
  errors: results.filter((row) => row.error).length,
  claimRowsVerified: results.filter((row) => row.verified).reduce((sum, row) => sum + row.sequences.length, 0),
}));
