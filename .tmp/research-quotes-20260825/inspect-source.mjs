import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Work/Expericentre/FORRÁSOK A SZAKIRODALOMHOZ.xlsx";
const outputDir = "C:/Work/Expericentre/.tmp/research-quotes-20260825/source-preview";

await fs.mkdir(outputDir, { recursive: true });
const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const summary = await workbook.inspect({
  kind: "workbook,sheet,table,region",
  maxChars: 30000,
  tableMaxRows: 12,
  tableMaxCols: 14,
  tableMaxCellChars: 220,
});
await fs.writeFile(path.join(outputDir, "inspect.ndjson"), summary.ndjson, "utf8");

const sheetSummary = await workbook.inspect({ kind: "sheet", include: "id,name", maxChars: 10000 });
await fs.writeFile(path.join(outputDir, "sheets.ndjson"), sheetSummary.ndjson, "utf8");

for (const sheet of workbook.worksheets.items) {
  const used = sheet.getUsedRange(true);
  const rangeAddress = used?.address ?? null;
  if (used) {
    await fs.writeFile(
      path.join(outputDir, `${sheet.name.replace(/[^a-z0-9_-]+/gi, "_")}.values.json`),
      JSON.stringify({ address: rangeAddress, values: used.values, formulas: used.formulas }, null, 2),
      "utf8",
    );
  }
  const details = rangeAddress
    ? await workbook.inspect({
        kind: "table,formula,computedStyle",
        sheetId: sheet.name,
        range: rangeAddress,
        maxChars: 50000,
        tableMaxRows: 250,
        tableMaxCols: 30,
        tableMaxCellChars: 1200,
        options: { maxResults: 500 },
      })
    : null;
  await fs.writeFile(
    path.join(outputDir, `${sheet.name.replace(/[^a-z0-9_-]+/gi, "_")}.ndjson`),
    details?.ndjson ?? "",
    "utf8",
  );
  const preview = await workbook.render({
    sheetName: sheet.name,
    autoCrop: "all",
    scale: 1,
    format: "png",
  });
  await fs.writeFile(
    path.join(outputDir, `${sheet.name.replace(/[^a-z0-9_-]+/gi, "_")}.png`),
    new Uint8Array(await preview.arrayBuffer()),
  );
}

console.log(JSON.stringify({
  sheets: workbook.worksheets.items.map((sheet) => ({ name: sheet.name, range: sheet.getUsedRange(true)?.address ?? null })),
  outputDir,
}));
