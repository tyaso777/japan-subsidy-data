import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const artifactToolEntry = require.resolve("@oai/artifact-tool");
const { FileBlob, SpreadsheetFile, Workbook } = await import(pathToFileURL(artifactToolEntry).href);

const here = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.join(here, "expanded_pair_review.xlsx");
const previewPath = path.join(here, "..", "..", "tmp", "pdfs", "expanded_pair_review_preview.png");

const csvFiles = [
  ["要因集計", "expanded_pair_factor_summary.csv"],
  ["40ペア", "expanded_matched_pair_review.csv"],
  ["80社", "expanded_pair_company_coding.csv"],
  ["感度分析", "expanded_pair_sensitivity.csv"],
];

const firstCsv = await fs.readFile(path.join(here, csvFiles[0][1]), "utf8");
const workbook = await Workbook.fromCSV(firstCsv, { sheetName: csvFiles[0][0] });
for (const [sheetName, fileName] of csvFiles.slice(1)) {
  const csvText = await fs.readFile(path.join(here, fileName), "utf8");
  await workbook.fromCSV(csvText, { sheetName });
}

const summaryData = JSON.parse(
  await fs.readFile(path.join(here, "expanded_pair_summary.json"), "utf8"),
);
const summary = workbook.worksheets.add("概要・方法");
summary.showGridLines = false;

summary.getRange("A1:J1").merge();
summary.getRange("A1").values = [["採択企業40ペア・公開PDF目視精査"]];
summary.getRange("A1:J1").format = {
  fill: "#17365D",
  font: { bold: true, color: "#FFFFFF", size: 16 },
  verticalAlignment: "center",
};
summary.getRange("A1:J1").format.rowHeight = 32;

summary.getRange("A3:B10").values = [
  ["主要指標", "値"],
  ["精査ペア", summaryData.pair_count],
  ["精査企業", summaryData.company_count],
  ["新規追加ペア", summaryData.new_pair_count],
  ["中核4要因のうち2要因以上が2点以上", summaryData.lower_core_two_or_more_share],
  ["中核4要因のうち3要因以上が2点以上", summaryData.lower_core_three_or_more_share],
  ["中核4要因のうち2要因以上が厳格3点", summaryData.lower_core_score3_two_or_more_share],
  ["低定量側の質的合計が高定量側以上", (summaryData.lower_qualitative_total_higher_count + summaryData.equal_qualitative_total_count) / summaryData.pair_count],
];
summary.getRange("A3:B3").format = {
  fill: "#4472C4",
  font: { bold: true, color: "#FFFFFF" },
};
summary.getRange("B7:B10").format.numberFormat = "0.0%";
summary.getRange("A3:B10").format.borders = { preset: "all", style: "thin", color: "#D9E2F3" };

const factorRows = Object.values(summaryData.factor_frequency);
summary.getRange("D3:F9").values = [
  ["6要因", "低定量側で2点以上", "高定量側で2点以上"],
  ...factorRows.map((row) => [row.label, row.lower_strong_share, row.higher_strong_share]),
];
summary.getRange("D3:F3").format = {
  fill: "#4472C4",
  font: { bold: true, color: "#FFFFFF" },
};
summary.getRange("E4:F9").format.numberFormat = "0.0%";
summary.getRange("D3:F9").format.borders = { preset: "all", style: "thin", color: "#D9E2F3" };

const chart = summary.charts.add("bar", summary.getRange("D3:F9"));
chart.title = "公開定量スコア低位／高位の質的要因頻度";
chart.hasLegend = true;
chart.xAxis = { axisType: "textAxis" };
chart.yAxis = { numberFormatCode: "0%", min: 0, max: 1 };
chart.setPosition("H3", "O20");

summary.getRange("A13:J13").merge();
summary.getRange("A13").values = [["読み方"]];
summary.getRange("A13:J13").format = {
  fill: "#D9EAF7",
  font: { bold: true, color: "#17365D" },
};
summary.getRange("A14:J19").merge(true);
summary.getRange("A14:A19").values = [
  ["0点: 記載なし／判断不能"],
  ["1点: 一般的な市場説明・方針のみ"],
  ["2点: 顧客、工程、地域、設備など案件固有の根拠あり"],
  ["3点: 実名顧客、受注、数量、待機期間、取得済み用地、認証、実証など検証可能な根拠あり"],
  ["重要: 採択企業同士の比較であり、採択確率・因果効果・審査点を推定するものではありません。"],
  ["厳格判定でも、低定量側の29/40件で中核4要因のうち2要因以上が3点でした。"],
];
summary.getRange("A14:J19").format = { wrapText: true, verticalAlignment: "center" };

summary.getRange("A21:J21").merge();
summary.getRange("A21").values = [["方法・出典"]];
summary.getRange("A21:J21").format = {
  fill: "#D9EAF7",
  font: { bold: true, color: "#17365D" },
};
summary.getRange("A22:J27").merge(true);
summary.getRange("A22:A27").values = [
  ["同一公募回・同一業種で、事業費・補助金額・基準売上高が近く、公開5軸の相対スコアに差がある企業を40ペア選定。企業重複なし。"],
  ["公開5軸: 成長・生産性、効果絶対額、補助金効率、賃金・雇用、企業変革投資。審査点ではありません。"],
  ["L02・L13・L27・L38の両社、計8社は公式PDF原画面も目視照合。全80社の個別PDF URLは「40ペア」「80社」シートに収録。"],
  ["公式サイト: https://seichotoushi-hojo.jp/"],
  ["詳細解釈: expanded_matched_pair_report.md"],
  ["再生成: select_matched_pair_candidates.py → analyze_expanded_matched_pairs.py → build_expanded_pair_workbook.mjs"],
];
summary.getRange("A22:J27").format = { wrapText: true, verticalAlignment: "center" };

summary.getRange("A:A").format.columnWidth = 38;
summary.getRange("B:B").format.columnWidth = 16;
summary.getRange("C:C").format.columnWidth = 3;
summary.getRange("D:D").format.columnWidth = 28;
summary.getRange("E:F").format.columnWidth = 18;
summary.getRange("G:G").format.columnWidth = 3;
summary.getRange("A14:J27").format.rowHeight = 28;
summary.freezePanes.freezeRows(1);

const tableStyle = (sheet, rangeAddress, headerAddress) => {
  sheet.showGridLines = false;
  sheet.freezePanes.freezeRows(1);
  const used = sheet.getRange(rangeAddress);
  used.format = { wrapText: true, verticalAlignment: "top" };
  used.format.borders = { preset: "all", style: "thin", color: "#E2E8F0" };
  sheet.getRange(headerAddress).format = {
    fill: "#17365D",
    font: { bold: true, color: "#FFFFFF" },
    wrapText: true,
    verticalAlignment: "center",
  };
  sheet.getRange(headerAddress).format.rowHeight = 36;
};

const factorSheet = workbook.worksheets.getItem("要因集計");
tableStyle(factorSheet, "A1:V7", "A1:V1");
factorSheet.getRange("A:A").format.columnWidth = 19;
factorSheet.getRange("B:B").format.columnWidth = 25;
factorSheet.getRange("C:V").format.columnWidth = 14;
factorSheet.getRange("F:F").format.numberFormat = "0.000";
factorSheet.getRange("H:J").format.numberFormat = "0.0%";
factorSheet.getRange("L:N").format.numberFormat = "0.0%";
factorSheet.getRange("P:P").format.numberFormat = "0.0%";
factorSheet.getRange("R:R").format.numberFormat = "0.0%";

const pairSheet = workbook.worksheets.getItem("40ペア");
tableStyle(pairSheet, "A1:AP41", "A1:AP1");
pairSheet.getRange("A:C").format.columnWidth = 13;
pairSheet.getRange("D:E").format.columnWidth = 24;
pairSheet.getRange("F:Q").format.columnWidth = 14;
pairSheet.getRange("R:AH").format.columnWidth = 11;
pairSheet.getRange("AI:AN").format.columnWidth = 30;
pairSheet.getRange("AO:AP").format.columnWidth = 48;
pairSheet.getRange("AI:AP").format.wrapText = true;

const companySheet = workbook.worksheets.getItem("80社");
tableStyle(companySheet, "A1:U81", "A1:U1");
companySheet.getRange("A:D").format.columnWidth = 15;
companySheet.getRange("E:E").format.columnWidth = 25;
companySheet.getRange("F:P").format.columnWidth = 14;
companySheet.getRange("Q:Q").format.columnWidth = 28;
companySheet.getRange("R:R").format.columnWidth = 42;
companySheet.getRange("S:T").format.columnWidth = 20;
companySheet.getRange("U:U").format.columnWidth = 48;

const sensitivitySheet = workbook.worksheets.getItem("感度分析");
tableStyle(sensitivitySheet, "A1:H64", "A1:H1");
sensitivitySheet.getRange("A:D").format.columnWidth = 24;
sensitivitySheet.getRange("E:H").format.columnWidth = 17;
sensitivitySheet.getRange("E:F").format.numberFormat = "0.0%";

const inspection = await workbook.inspect({
  kind: "sheet",
  include: "id,name",
  maxChars: 4000,
});
console.log(inspection.ndjson ?? inspection);

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outputPath);
const saved = await FileBlob.load(outputPath);
const reopened = await SpreadsheetFile.importXlsx(saved);
const reopenedInspection = await reopened.inspect({
  kind: "sheet",
  include: "id,name",
  maxChars: 4000,
});
console.log(reopenedInspection.ndjson ?? reopenedInspection);
await fs.mkdir(path.dirname(previewPath), { recursive: true });
const preview = await reopened.render({
  sheetName: "概要・方法",
  autoCrop: "all",
  scale: 1,
  format: "png",
});
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));
console.log(outputPath);
console.log(previewPath);
