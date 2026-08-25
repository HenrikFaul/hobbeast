import fs from "node:fs/promises";

const source = JSON.parse(await fs.readFile("./source-preview/Munkalap1.values.json", "utf8"));
const analysis = JSON.parse(await fs.readFile("./source-analysis.json", "utf8"));
const [, ...rows] = source.values;

const normalize = (value) => String(value ?? "")
  .normalize("NFKC")
  .toLocaleLowerCase("hu-HU")
  .replace(/[„”"'’`´]/g, "")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim()
  .replace(/\s+/g, " ");

const publicSourceDefinitions = [
  {
    sequences: [6, 205, 206, 316, 317, 435, 436],
    sourceUrl: "https://www.journals.uchicago.edu/doi/10.1086/225469",
    doi: "10.1086/225469",
    verification: "Elsődleges kiadói cikkoldal és absztrakt ellenőrizve 2026-08-25",
    evidenceType: "peer_reviewed_article",
    topics: ["gyenge_kotesek", "kozossegi_hidak", "uj_lehetosegek"],
  },
  {
    sequences: [8],
    sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/7777651/",
    doi: "10.1037/0033-2909.117.3.497",
    verification: "PubMed bibliográfia és absztrakt ellenőrizve 2026-08-25",
    evidenceType: "peer_reviewed_review",
    topics: ["valahova_tartozas", "tartos_kapcsolatok"],
  },
  {
    sequences: [27, 28, 121, 185],
    sourceUrl: "https://doi.org/10.1037/0033-2909.98.2.310",
    doi: "10.1037/0033-2909.98.2.310",
    verification: "DOI bibliográfia és a forrás absztraktja ellenőrizve 2026-08-25",
    evidenceType: "peer_reviewed_review",
    topics: ["tarsas_tamogatas", "stressz", "kolcsonos_segites"],
  },
  {
    sequences: [113, 114, 115, 308, 398, 399, 459, 480],
    sourceUrl: "https://www.who.int/publications/i/item/978240112360",
    doi: null,
    verification: "WHO elsődleges jelentésoldal és teljes jelentés ellenőrizve 2026-08-25",
    evidenceType: "institutional_report",
    topics: ["tarsas_infrastruktura", "hozzaferhetoseg", "befogadas", "rendszerszintu_kapcsolodas"],
  },
  {
    sequences: [118],
    sourceUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3150158/",
    doi: "10.1177/0022146510383501",
    verification: "Teljes lektorált cikk ellenőrizve a kiadói kézirattárban 2026-08-25",
    evidenceType: "peer_reviewed_review",
    topics: ["kapcsolatminoseg", "biztonsagos_kozosseg"],
  },
  {
    sequences: [200, 201, 301, 302, 443, 444],
    sourceUrl: "https://books.google.com/books/about/Social_Pressures_in_Informal_Groups.html?id=J24AAAAAMAAJ",
    doi: null,
    verification: "Kiadás, szerzők és év bibliográfiai rekordja ellenőrizve 2026-08-25",
    evidenceType: "research_monograph",
    topics: ["ismetelt_talalkozas", "kozossegi_ter", "kozeliseg"],
  },
  {
    sequences: [202, 322],
    sourceUrl: "https://doi.org/10.1037/h0025848",
    doi: "10.1037/h0025848",
    verification: "Kiadói DOI-metaadat és absztrakt ellenőrizve 2026-08-25",
    evidenceType: "peer_reviewed_article",
    topics: ["ismetelt_talalkozas", "biztonsag", "pozitiv_elmeny"],
  },
  {
    sequences: [450],
    sourceUrl: "https://doi.org/10.2307/2666999",
    doi: "10.2307/2666999",
    verification: "Elsődleges kiadói cikkoldal és absztrakt ellenőrizve 2026-08-25",
    evidenceType: "peer_reviewed_article",
    topics: ["pszichologiai_biztonsag", "tanulas", "kolcsonos_tamogatas"],
  },
];

const definitionBySequence = new Map();
for (const definition of publicSourceDefinitions) {
  for (const sequence of definition.sequences) definitionBySequence.set(String(sequence), definition);
}

const firstByStatement = new Map();
const duplicateRows = [];
const uniqueRows = [];
for (const row of rows) {
  const key = normalize(row[1]);
  const canonical = firstByStatement.get(key);
  const record = {
    sourceRow: Number(row[0]) + 1,
    sequence: row[0],
    statement: row[1],
    publication: row[2],
    authors: row[3],
    year: row[4],
  };
  if (canonical) {
    duplicateRows.push({ ...record, canonicalSequence: canonical.sequence, canonicalSourceRow: canonical.sourceRow });
  } else {
    firstByStatement.set(key, record);
    uniqueRows.push(record);
  }
}

const ambiguousSequence = new Set(analysis.ambiguousMetadata.map((row) => String(row.sequence)));
const sensitiveSequence = new Set(analysis.highSensitivity.map((row) => String(row.sequence)));

const acceptedRows = [];
const reviewRows = [];
for (const record of uniqueRows) {
  const definition = definitionBySequence.get(String(record.sequence));
  if (definition) {
    acceptedRows.push({
      ...record,
      locale: "hu-HU",
      sourceUrl: definition.sourceUrl,
      doi: definition.doi,
      verification: definition.verification,
      evidenceType: definition.evidenceType,
      topics: definition.topics.join(", "),
      publicationStatus: "published",
      editorialNote: "Az állítás szövege változtatás nélkül került át a forrásmunkafüzetből.",
    });
    continue;
  }

  const reasonCodes = [];
  const reasonDescriptions = [];
  if (sensitiveSequence.has(String(record.sequence))) {
    reasonCodes.push("HIGH_SENSITIVITY_PUBLIC_TONE");
    reasonDescriptions.push("halálozásra, súlyos betegségre, erőszakra vagy más érzelmileg terhelő témára utal; nyilvános random rotáció előtt külön szakmai és UX review kell");
  }
  if (ambiguousSequence.has(String(record.sequence))) {
    reasonCodes.push("BIBLIOGRAPHY_INCOMPLETE_OR_SYNTHETIC");
    reasonDescriptions.push("a szerző-, év- vagy forrásmező hiányos, összefoglaló jellegű vagy több művet egyesít");
  }
  if (!reasonCodes.length) {
    reasonCodes.push("PRIMARY_SOURCE_VERIFICATION_PENDING");
    reasonDescriptions.push("a megadott bibliográfia alapján ebben a körben nem készült elég erős elsődleges forrás-ellenőrzés a nyilvános rotációhoz");
  }
  reviewRows.push({
    ...record,
    reasonCode: reasonCodes.join("; "),
    reviewReason: reasonDescriptions.join("; "),
    recommendedAction: "Emberi szakirodalmi ellenőrzés után változtatás nélkül jóváhagyható vagy elutasítható.",
  });
}

const uniqueSources = new Map();
for (const row of acceptedRows) {
  const key = `${normalize(row.publication)}|${normalize(row.authors)}|${normalize(row.year)}`;
  if (!uniqueSources.has(key)) {
    uniqueSources.set(key, {
      publication: row.publication,
      authors: row.authors,
      year: row.year,
      sourceUrl: row.sourceUrl,
      doi: row.doi,
      verification: row.verification,
      evidenceType: row.evidenceType,
      claimCount: 0,
    });
  }
  uniqueSources.get(key).claimCount += 1;
}

const output = {
  generatedAt: "2026-08-25",
  sourceWorkbook: "FORRÁSOK A SZAKIRODALOMHOZ.xlsx",
  sourceContext: "kozossegi_terek_izolacio_magany_80_kutatasi_allitas.md",
  summary: {
    rawRows: rows.length,
    exactDuplicateRows: duplicateRows.length,
    uniqueRows: uniqueRows.length,
    acceptedPublishedRows: acceptedRows.length,
    humanReviewRows: reviewRows.length,
    acceptedSources: uniqueSources.size,
  },
  acceptedRows,
  reviewRows,
  duplicateRows,
  sources: [...uniqueSources.values()],
};

if (output.summary.rawRows !== output.summary.exactDuplicateRows + output.summary.acceptedPublishedRows + output.summary.humanReviewRows) {
  throw new Error("Row reconciliation failed");
}

await fs.writeFile("./processed-literature.json", JSON.stringify(output, null, 2), "utf8");
console.log(JSON.stringify(output.summary));
