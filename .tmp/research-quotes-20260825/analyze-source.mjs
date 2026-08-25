import fs from "node:fs/promises";

const input = JSON.parse(await fs.readFile("./source-preview/Munkalap1.values.json", "utf8"));
const [headers, ...rows] = input.values;

const normalize = (value) => String(value ?? "")
  .normalize("NFKC")
  .toLocaleLowerCase("hu-HU")
  .replace(/[„”"'’`´]/g, "")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim()
  .replace(/\s+/g, " ");

const tokens = (value) => new Set(normalize(value).split(" ").filter((token) => token.length > 2));
const jaccard = (left, right) => {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size && !b.size) return 1;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
};

const records = rows.map((row, index) => ({
  sourceRow: index + 2,
  sequence: row[0],
  statement: row[1],
  publication: row[2],
  authors: row[3],
  year: row[4],
  statementKey: normalize(row[1]),
  citationKey: [row[2], row[3], row[4]].map(normalize).join("|"),
}));

const exactGroups = new Map();
for (const record of records) {
  const group = exactGroups.get(record.statementKey) ?? [];
  group.push(record);
  exactGroups.set(record.statementKey, group);
}

const exactDuplicates = [...exactGroups.values()].filter((group) => group.length > 1);
const citationGroups = new Map();
for (const record of records) {
  const group = citationGroups.get(record.citationKey) ?? [];
  group.push(record);
  citationGroups.set(record.citationKey, group);
}

const nearDuplicates = [];
for (const group of citationGroups.values()) {
  if (group.length < 2 || group.length > 40) continue;
  for (let i = 0; i < group.length; i += 1) {
    for (let j = i + 1; j < group.length; j += 1) {
      if (group[i].statementKey === group[j].statementKey) continue;
      const score = jaccard(group[i].statement, group[j].statement);
      if (score >= 0.72) {
        nearDuplicates.push({
          score: Number(score.toFixed(3)),
          left: { sequence: group[i].sequence, statement: group[i].statement },
          right: { sequence: group[j].sequence, statement: group[j].statement },
          publication: group[i].publication,
          authors: group[i].authors,
          year: group[i].year,
        });
      }
    }
  }
}

const titleCounts = [...citationGroups.entries()].map(([key, group]) => ({
  citationKey: key,
  count: group.length,
  publication: group[0].publication,
  authors: group[0].authors,
  year: group[0].year,
})).sort((a, b) => b.count - a.count || a.publication.localeCompare(b.publication, "hu"));

const ambiguousMetadata = records.filter((record) =>
  /több szerző|és mtsai|et al\.?/iu.test(record.authors)
  || /szintézis|irodalom szintézise|kutatások szintézise/iu.test(record.publication)
  || /^\d{4}[–-]\d{4}$/u.test(String(record.year))
);

const highSensitivity = records.filter((record) =>
  /öngyilk|halálo|mortalit|túlélési|koszorúér|stroke|demenci|depressz|szorong|pszichózis|bántalmaz|hajléktalan|trauma|abúzus|erőszak|diagnoszt/iu.test(`${record.statement} ${record.publication}`)
);

const out = {
  headers,
  counts: {
    rows: records.length,
    exactDuplicateGroups: exactDuplicates.length,
    exactDuplicateRows: exactDuplicates.reduce((sum, group) => sum + group.length - 1, 0),
    uniqueStatements: exactGroups.size,
    uniqueCitations: citationGroups.size,
    nearDuplicatePairs: nearDuplicates.length,
    ambiguousMetadataRows: ambiguousMetadata.length,
    highSensitivityRows: highSensitivity.length,
  },
  exactDuplicates: exactDuplicates.map((group) => group.map(({ sequence, sourceRow, statement, publication, authors, year }) => ({ sequence, sourceRow, statement, publication, authors, year }))),
  nearDuplicates: nearDuplicates.sort((a, b) => b.score - a.score),
  titleCounts,
  ambiguousMetadata: ambiguousMetadata.map(({ sequence, statement, publication, authors, year }) => ({ sequence, statement, publication, authors, year })),
  highSensitivity: highSensitivity.map(({ sequence, statement, publication, authors, year }) => ({ sequence, statement, publication, authors, year })),
};

await fs.writeFile("./source-analysis.json", JSON.stringify(out, null, 2), "utf8");
console.log(JSON.stringify(out.counts));
