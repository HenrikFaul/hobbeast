import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const data = JSON.parse(await fs.readFile("./processed-literature.json", "utf8"));
const outputDir = "C:/Work/Expericentre/outputs/20260825-community-research";
const previewDir = path.join(outputDir, "previews");
await fs.mkdir(previewDir, { recursive: true });

const colors = {
  forest: "#173F2A",
  forestDark: "#0B281A",
  lime: "#D7FF45",
  cream: "#FFFDF7",
  sand: "#F3F0E7",
  coral: "#FF866E",
  lavender: "#C9B5FF",
  ink: "#17231B",
  muted: "#627067",
  line: "#D9DED8",
  white: "#FFFFFF",
  red: "#B42318",
  redSoft: "#FEE4E2",
};

const safeName = (name) => name.normalize("NFKD").replace(/\p{M}+/gu, "").replace(/[^a-z0-9_-]+/gi, "_");

function styleTitle(sheet, title, subtitle, endColumn) {
  sheet.showGridLines = false;
  sheet.getRange(`A1:${endColumn}1`).merge();
  sheet.getRange("A1").values = [[title]];
  sheet.getRange(`A1:${endColumn}1`).format = {
    fill: colors.forestDark,
    font: { bold: true, color: colors.white, size: 18, typeface: "Arial" },
    verticalAlignment: "center",
  };
  sheet.getRange(`A2:${endColumn}2`).merge();
  sheet.getRange("A2").values = [[subtitle]];
  sheet.getRange(`A2:${endColumn}2`).format = {
    fill: colors.forest,
    font: { color: colors.white, size: 10, typeface: "Arial" },
    wrapText: true,
    verticalAlignment: "center",
  };
  sheet.getRange("A1").format.rowHeight = 30;
  sheet.getRange("A2").format.rowHeight = 38;
}

function styleHeader(range, fill = colors.lime, fontColor = colors.ink) {
  range.format = {
    fill,
    font: { bold: true, color: fontColor, typeface: "Arial" },
    wrapText: true,
    verticalAlignment: "center",
    borders: { preset: "outside", style: "thin", color: colors.line },
  };
  range.format.rowHeight = 34;
}

function styleBody(range) {
  range.format = {
    font: { color: colors.ink, size: 10, typeface: "Arial" },
    wrapText: true,
    verticalAlignment: "top",
    borders: {
      insideHorizontal: { style: "thin", color: colors.line },
      bottom: { style: "thin", color: colors.line },
    },
  };
}

function addAcceptedSummary(workbook) {
  const sheet = workbook.worksheets.getItem("Jegyzőkönyv");
  styleTitle(
    sheet,
    "Hobbeast · szakirodalmi feldolgozási jegyzőkönyv",
    "Az eredeti forrásfájl változatlan maradt. A nyilvános induló készlet csak deduplikált, bibliográfiailag ellenőrzött és közösségi felületen vállalható tételeket tartalmaz.",
    "B",
  );
  sheet.getRange("A4:B10").values = [
    ["Mutató", "Érték"],
    ["Forrásfájl sorai", data.summary.rawRows],
    ["Teljesen azonos, eltávolított ismétlések", data.summary.exactDuplicateRows],
    ["Egyedi állítások", data.summary.uniqueRows],
    ["Nyilvános induló készlet", null],
    ["Emberi felülvizsgálatra irányítva", data.summary.humanReviewRows],
    ["Egyeztetési kontroll", null],
  ];
  sheet.getRange("B8").formulas = [["=COUNTA('Importálható'!$A$5:$A$2000)"]];
  sheet.getRange("B10").formulas = [["=B6+B8+B9"]];
  styleHeader(sheet.getRange("A4:B4"));
  styleBody(sheet.getRange("A5:B10"));
  sheet.getRange("A12:B16").values = [
    ["Szabály", "Leírás"],
    ["Szöveghűség", "Az állítás, forrás, szerző és év szövege változtatás nélkül került át."],
    ["Deduplikáció", "Unicode-normalizált, kisbetűsített, írásjel- és whitespace-normalizált teljes állításszöveg alapján; az első előfordulás a kanonikus."],
    ["Nyilvános státusz", "Csak külön ellenőrzött, pozitív vagy óvatosan megfogalmazott tételek; a többi nem törlődött, hanem review-kimenetbe került."],
    ["Lokalizáció", "A forrásnyelvi rekord és a fordítások külön táblába kerülnek; a hu-HU induló szöveg később nem írható felül fordításkor."],
  ];
  styleHeader(sheet.getRange("A12:B12"), colors.lavender, colors.ink);
  styleBody(sheet.getRange("A13:B16"));
  sheet.getRange("A4:A16").format.columnWidth = 34;
  sheet.getRange("B4:B16").format.columnWidth = 96;
  sheet.getRange("A13:B16").format.rowHeight = 45;
  sheet.freezePanes.freezeRows(2);
  return sheet;
}

function addAcceptedClaims(workbook) {
  const sheet = workbook.worksheets.getItem("Importálható");
  const headers = [
    "Forrás sorszám",
    "Forrás Excel-sor",
    "Locale",
    "Állítás — változtatás nélkül",
    "Könyv / szakirodalmi forrás — változtatás nélkül",
    "Szerző(k) — változtatás nélkül",
    "Év — változtatás nélkül",
    "Forrás URL",
    "DOI",
    "Ellenőrzés",
    "Bizonyítéktípus",
    "Témacímkék",
    "Publikációs státusz",
    "Szerkesztői megjegyzés",
  ];
  styleTitle(
    sheet,
    "Importálható közösségi kutatási állítások",
    "A 30 sor a Hobbeast hu-HU induló, nyilvánosan forgatható készlete. A forrásszöveg nem lett átírva; az ellenőrzési és működési mezők külön oszlopok.",
    "N",
  );
  sheet.getRange("A4:N4").values = [headers];
  styleHeader(sheet.getRange("A4:N4"));
  const values = data.acceptedRows.map((row) => [
    row.sequence,
    row.sourceRow,
    row.locale,
    row.statement,
    row.publication,
    row.authors,
    row.year,
    row.sourceUrl,
    row.doi,
    row.verification,
    row.evidenceType,
    row.topics,
    row.publicationStatus,
    row.editorialNote,
  ]);
  sheet.getRangeByIndexes(4, 0, values.length, headers.length).values = values;
  styleBody(sheet.getRangeByIndexes(4, 0, values.length, headers.length));
  sheet.getRange(`A5:B${values.length + 4}`).format.numberFormat = "0";
  sheet.getRange(`A5:C${values.length + 4}`).format.horizontalAlignment = "center";
  sheet.getRange(`M5:M${values.length + 4}`).format.horizontalAlignment = "center";
  sheet.getRange(`A5:N${values.length + 4}`).format.rowHeight = 72;
  const widths = [14, 14, 10, 58, 38, 34, 14, 42, 28, 38, 23, 34, 18, 38];
  widths.forEach((width, index) => sheet.getRangeByIndexes(3, index, values.length + 1, 1).format.columnWidth = width);
  const table = sheet.tables.add(`A4:N${values.length + 4}`, true, "AcceptedClaimsTable");
  table.style = "TableStyleMedium4";
  sheet.freezePanes.freezeRows(4);
  sheet.freezePanes.freezeColumns(3);
  return sheet;
}

function addSources(workbook) {
  const sheet = workbook.worksheets.getItem("Forrásjegyzék");
  const headers = ["Forrás", "Szerző(k)", "Év", "Forrás URL", "DOI", "Ellenőrzés", "Bizonyítéktípus", "Állítások száma"];
  styleTitle(sheet, "Ellenőrzött forrásjegyzék", "Az importálható állításokhoz tartozó egyedi források és auditnyomuk.", "H");
  sheet.getRange("A4:H4").values = [headers];
  styleHeader(sheet.getRange("A4:H4"));
  const values = data.sources.map((row) => [
    row.publication,
    row.authors,
    row.year,
    row.sourceUrl,
    row.doi,
    row.verification,
    row.evidenceType,
    row.claimCount,
  ]);
  sheet.getRangeByIndexes(4, 0, values.length, headers.length).values = values;
  styleBody(sheet.getRangeByIndexes(4, 0, values.length, headers.length));
  sheet.getRange(`A5:H${values.length + 4}`).format.rowHeight = 62;
  [40, 36, 14, 45, 28, 42, 24, 14].forEach((width, index) => sheet.getRangeByIndexes(3, index, values.length + 1, 1).format.columnWidth = width);
  sheet.getRange(`H5:H${values.length + 4}`).format.numberFormat = "0";
  const table = sheet.tables.add(`A4:H${values.length + 4}`, true, "AcceptedSourcesTable");
  table.style = "TableStyleMedium4";
  sheet.freezePanes.freezeRows(4);
  return sheet;
}

function addLocalizationSchema(workbook) {
  const sheet = workbook.worksheets.getItem("Lokalizációs séma");
  styleTitle(sheet, "Lokalizációs adatmodell", "A stabil forrásrekord és a fordítható megjelenítési tartalom külön él; minden locale önálló review- és publikációs állapotot kaphat.", "D");
  const rows = [
    ["Tábla", "Mező", "Fordítható?", "Szerep"],
    ["community_research_claims", "id, source_sequence_id, publication_year, source_url, doi, evidence_type, review_status, publication_status, is_active", "Nem", "Stabil forrás-, audit- és lifecycle-adatok"],
    ["community_research_claim_translations", "claim_id, locale, statement_text, source_title, authors_display, translator_note", "Igen", "Locale-specifikus, változatlanul auditálható állítás és bibliográfiai megjelenítés"],
    ["community_research_claim_topics", "claim_id, topic_key", "Nem", "Nyelvfüggetlen tematikus címkék"],
    ["community_research_claim_saves", "user_id, claim_id, created_at", "Nem", "Felhasználónkénti szív + mentés; egyedi user/claim kulcs"],
    ["RPC", "get_random_community_research_claim(locale, placement, exclude_ids)", "—", "Csak approved + published + aktív rekord, locale-fallback és korlátozott random választás"],
  ];
  sheet.getRange("A4:D9").values = rows;
  styleHeader(sheet.getRange("A4:D4"), colors.lavender, colors.ink);
  styleBody(sheet.getRange("A5:D9"));
  [42, 72, 16, 62].forEach((width, index) => sheet.getRangeByIndexes(3, index, rows.length, 1).format.columnWidth = width);
  sheet.getRange("A5:D9").format.rowHeight = 58;
  sheet.freezePanes.freezeRows(4);
  return sheet;
}

function addReviewSummary(workbook) {
  const sheet = workbook.worksheets.getItem("Jegyzőkönyv");
  styleTitle(
    sheet,
    "Hobbeast · emberi szakirodalmi felülvizsgálat",
    "Ezek a sorok nem törlődtek és nem lettek átírva. Nyilvános random rotációba csak egy későbbi, dokumentált jóváhagyás után kerülhetnek.",
    "B",
  );
  sheet.getRange("A4:B11").values = [
    ["Mutató", "Érték"],
    ["Forrásfájl sorai", data.summary.rawRows],
    ["Egyedi állítások", data.summary.uniqueRows],
    ["Importálható, publikált induló készlet", data.summary.acceptedPublishedRows],
    ["Felülvizsgálandó egyedi sorok", null],
    ["Teljesen azonos ismétlések", null],
    ["Egyeztetési kontroll", null],
    ["Eredeti forrás módosítva?", "Nem"],
  ];
  sheet.getRange("B8").formulas = [["=COUNTA('Felülvizsgálandó'!$A$5:$A$2000)"]];
  sheet.getRange("B9").formulas = [["=COUNTA('Deduplikált'!$A$5:$A$2000)"]];
  sheet.getRange("B10").formulas = [["=B7+B8+B9"]];
  styleHeader(sheet.getRange("A4:B4"), colors.coral, colors.ink);
  styleBody(sheet.getRange("A5:B11"));
  sheet.getRange("A13:B17").values = [
    ["Review-kód", "Jelentés"],
    ["HIGH_SENSITIVITY_PUBLIC_TONE", "Súlyos egészségügyi, halálozási, erőszakos vagy erősen terhelő téma; külön szakmai és UX döntés kell."],
    ["BIBLIOGRAPHY_INCOMPLETE_OR_SYNTHETIC", "Hiányos szerzőnév, évintervallum vagy több műből képzett szintézis miatt bibliográfiai pontosítás kell."],
    ["PRIMARY_SOURCE_VERIFICATION_PENDING", "A forrás ebben a körben nem kapott elég erős elsődleges ellenőrzést a publikus rotációhoz."],
    ["EXACT_DUPLICATE", "A teljes normalizált állításszöveg már szerepel; az első előfordulás maradt a kanonikus rekord."],
  ];
  styleHeader(sheet.getRange("A13:B13"), colors.redSoft, colors.red);
  styleBody(sheet.getRange("A14:B17"));
  sheet.getRange("A4:A17").format.columnWidth = 40;
  sheet.getRange("B4:B17").format.columnWidth = 96;
  sheet.getRange("A14:B17").format.rowHeight = 54;
  sheet.freezePanes.freezeRows(2);
  return sheet;
}

function addReviewRows(workbook) {
  const sheet = workbook.worksheets.getItem("Felülvizsgálandó");
  const headers = ["Forrás sorszám", "Forrás Excel-sor", "Állítás — változtatás nélkül", "Könyv / szakirodalmi forrás — változtatás nélkül", "Szerző(k) — változtatás nélkül", "Év — változtatás nélkül", "Review-kód", "Indok", "Javasolt következő lépés"];
  styleTitle(sheet, "Emberi felülvizsgálatra váró egyedi állítások", "A szöveg és bibliográfia változatlan. A review-oszlopok kizárólag a nyilvános felhasználhatósági döntést dokumentálják.", "I");
  sheet.getRange("A4:I4").values = [headers];
  styleHeader(sheet.getRange("A4:I4"), colors.coral, colors.ink);
  const values = data.reviewRows.map((row) => [
    row.sequence,
    row.sourceRow,
    row.statement,
    row.publication,
    row.authors,
    row.year,
    row.reasonCode,
    row.reviewReason,
    row.recommendedAction,
  ]);
  sheet.getRangeByIndexes(4, 0, values.length, headers.length).values = values;
  styleBody(sheet.getRangeByIndexes(4, 0, values.length, headers.length));
  sheet.getRange(`A5:B${values.length + 4}`).format.numberFormat = "0";
  sheet.getRange(`A5:B${values.length + 4}`).format.horizontalAlignment = "center";
  sheet.getRange(`A5:I${values.length + 4}`).format.rowHeight = 68;
  [14, 14, 60, 40, 34, 15, 34, 52, 42].forEach((width, index) => sheet.getRangeByIndexes(3, index, values.length + 1, 1).format.columnWidth = width);
  const table = sheet.tables.add(`A4:I${values.length + 4}`, true, "HumanReviewClaimsTable");
  table.style = "TableStyleMedium3";
  sheet.freezePanes.freezeRows(4);
  sheet.freezePanes.freezeColumns(2);
  return sheet;
}

function addDuplicateRows(workbook) {
  const sheet = workbook.worksheets.getItem("Deduplikált");
  const headers = ["Ismétlődő sorszám", "Ismétlődő Excel-sor", "Kanonikus sorszám", "Kanonikus Excel-sor", "Állítás — változtatás nélkül", "Forrás — változtatás nélkül", "Szerző(k) — változtatás nélkül", "Év — változtatás nélkül", "Döntés"];
  styleTitle(sheet, "Eltávolított teljes ismétlések", "A 80 sor szövege megegyezett egy korábbi sorral. Semmi nem veszett el: a kanonikus forrássorszám minden ismétlés mellett szerepel.", "I");
  sheet.getRange("A4:I4").values = [headers];
  styleHeader(sheet.getRange("A4:I4"), colors.redSoft, colors.red);
  const values = data.duplicateRows.map((row) => [
    row.sequence,
    row.sourceRow,
    row.canonicalSequence,
    row.canonicalSourceRow,
    row.statement,
    row.publication,
    row.authors,
    row.year,
    "EXACT_DUPLICATE — az első előfordulás maradt kanonikus",
  ]);
  sheet.getRangeByIndexes(4, 0, values.length, headers.length).values = values;
  styleBody(sheet.getRangeByIndexes(4, 0, values.length, headers.length));
  sheet.getRange(`A5:D${values.length + 4}`).format.numberFormat = "0";
  sheet.getRange(`A5:D${values.length + 4}`).format.horizontalAlignment = "center";
  sheet.getRange(`A5:I${values.length + 4}`).format.rowHeight = 66;
  [15, 15, 15, 15, 62, 40, 34, 15, 42].forEach((width, index) => sheet.getRangeByIndexes(3, index, values.length + 1, 1).format.columnWidth = width);
  const table = sheet.tables.add(`A4:I${values.length + 4}`, true, "ExactDuplicateClaimsTable");
  table.style = "TableStyleMedium3";
  sheet.freezePanes.freezeRows(4);
  sheet.freezePanes.freezeColumns(4);
  return sheet;
}

async function verifyAndExport(workbook, filename) {
  const checks = [];
  for (const sheet of workbook.worksheets.items) {
    const used = sheet.getUsedRange(true);
    const address = used?.address ?? "A1";
    const inspect = await workbook.inspect({
      kind: "table,formula",
      sheetId: sheet.name,
      range: address,
      maxChars: 8000,
      tableMaxRows: 14,
      tableMaxCols: 14,
      tableMaxCellChars: 500,
      options: { maxResults: 120 },
    });
    checks.push({ sheet: sheet.name, address, inspect: inspect.ndjson });
    const endMatch = address.match(/:([A-Z]+)(\d+)$/i) ?? address.match(/^([A-Z]+)(\d+)$/i);
    const lastColumn = endMatch?.[1] ?? "A";
    const lastRow = Number(endMatch?.[2] ?? 1);
    const renderRanges = lastRow > 100
      ? [
          { label: "top", range: `A1:${lastColumn}55` },
          { label: "bottom", range: `A${Math.max(1, lastRow - 49)}:${lastColumn}${lastRow}` },
        ]
      : [{ label: "all", range: address }];
    for (const renderRange of renderRanges) {
      const preview = await workbook.render({ sheetName: sheet.name, range: renderRange.range, scale: 1, format: "png" });
      await fs.writeFile(
        path.join(previewDir, `${safeName(filename)}__${safeName(sheet.name)}__${renderRange.label}.png`),
        new Uint8Array(await preview.arrayBuffer()),
      );
    }
  }
  const errors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 300 },
    summary: "final formula error scan",
    maxChars: 10000,
  });
  await fs.writeFile(path.join(outputDir, `${filename}.verification.json`), JSON.stringify({ checks, formulaErrors: errors.ndjson }, null, 2), "utf8");
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(path.join(outputDir, `${filename}.xlsx`));
}

const acceptedWorkbook = Workbook.create();
acceptedWorkbook.worksheets.add("Jegyzőkönyv");
acceptedWorkbook.worksheets.add("Importálható");
acceptedWorkbook.worksheets.add("Forrásjegyzék");
acceptedWorkbook.worksheets.add("Lokalizációs séma");
addAcceptedSummary(acceptedWorkbook);
addAcceptedClaims(acceptedWorkbook);
addSources(acceptedWorkbook);
addLocalizationSchema(acceptedWorkbook);

const reviewWorkbook = Workbook.create();
reviewWorkbook.worksheets.add("Jegyzőkönyv");
reviewWorkbook.worksheets.add("Felülvizsgálandó");
reviewWorkbook.worksheets.add("Deduplikált");
addReviewSummary(reviewWorkbook);
addReviewRows(reviewWorkbook);
addDuplicateRows(reviewWorkbook);

await verifyAndExport(acceptedWorkbook, "Hobbeast_kozossegi_allitasok_elfogadott_v1.12.0");
await verifyAndExport(reviewWorkbook, "Hobbeast_kozossegi_allitasok_emberi_felulvizsgalat_v1.12.0");

console.log(JSON.stringify({ outputDir, summary: data.summary }));
