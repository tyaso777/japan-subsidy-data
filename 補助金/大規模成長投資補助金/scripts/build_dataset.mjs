#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--source-dir") args.sourceDir = argv[++i];
  }
  return args;
}

const { sourceDir } = parseArgs(process.argv.slice(2));
if (!sourceDir) {
  throw new Error("Usage: node scripts/build_dataset.mjs --source-dir <growth-investment-1-4-analysis>");
}

const reviewDir = path.join(sourceDir, "all_review");
const outputDir = path.join(sourceDir, "output");
const out = {
  processed: path.join(projectDir, "data", "processed"),
  text: path.join(projectDir, "data", "text"),
  excel: path.join(projectDir, "excel"),
  html: path.join(projectDir, "html"),
  htmlData: path.join(projectDir, "html", "data"),
  docs: path.join(projectDir, "docs"),
  schemas: path.join(projectDir, "schemas"),
};
await Promise.all(Object.values(out).map((dir) => fs.mkdir(dir, { recursive: true })));

const load = async (name) => JSON.parse(await fs.readFile(path.join(reviewDir, name), "utf8"));
const [review, costData, salesData, boxData, metricData] = await Promise.all([
  load("all_review_box_augmented.json"),
  load("cost_boxes.json"),
  load("sales_box_extraction.json"),
  load("page_boxes.json"),
  load("metric_validation.json"),
]);

const normalize = (value) => {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.join(" | ");
  if (typeof value === "object") return JSON.stringify(value);
  return value;
};

const csvCell = (value) => {
  const text = String(normalize(value)).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

async function writeCsv(file, rows, columns) {
  const lines = [columns.map(csvCell).join(",")];
  for (const row of rows) lines.push(columns.map((column) => csvCell(row[column])).join(","));
  await fs.writeFile(file, `\uFEFF${lines.join("\r\n")}\r\n`, "utf8");
}

async function writeJson(file, value) {
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeJsonl(file, rows) {
  await fs.writeFile(file, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

const byCase = (rows) => new Map(rows.map((row) => [row.case_id, row]));
const costs = byCase(costData.rows);
const sales = byCase(salesData.rows);
const metricsByCase = new Map();
for (const row of metricData.rows) {
  if (!metricsByCase.has(row.case_id)) metricsByCase.set(row.case_id, new Map());
  metricsByCase.get(row.case_id).set(row.metric, row);
}

const metricAliases = {
  labor: "労働生産性",
  employee_pay: "従業員1人当たり給与支給総額",
  officer_pay: "役員1人当たり給与支給総額",
  employees: "補助事業に係る従業員数",
};

const metricFields = (metric) => ({
  base_year: metric?.base_year ?? "",
  base_value: metric?.base_value ?? "",
  target_year: metric?.target_year ?? "",
  target_value: metric?.target_value ?? "",
  unit: metric?.unit ?? "",
  annual_rate_pct: metric?.listed_rate_pct ?? metric?.calculated_rate_pct ?? "",
  validation: metric?.status ?? "",
});

const cases = review.cases.map((item) => {
  const cost = costs.get(item.case_id) ?? {};
  const sale = sales.get(item.case_id) ?? {};
  const metricMap = metricsByCase.get(item.case_id) ?? new Map();
  const row = {
    case_id: item.case_id,
    round: item.round,
    company: item.company,
    target_entity: item.target_entity,
    scope: item.scope,
    other_participants: item.other_participants,
    page_count: item.page_count,
    vision_page_count: item.vision_page_count,
    project_page_count: item.project_page_count,
    additional_page_count: item.additional_page_count,
    project_cost_million_yen: cost.cost_million,
    subsidy_million_yen: cost.subsidy_million,
    subsidy_rate_pct: cost.subsidy_rate_pct,
    cost_page: cost.page,
    cost_source_method: cost.source_method,
    cost_validation: cost.validation,
    cost_box_transcription: cost.box_transcription,
    sales_baseline_year: sale.baseline_year,
    sales_baseline_oku_yen: sale.baseline_sales_oku,
    sales_target_year: sale.target_year,
    sales_target_oku_yen: sale.target_sales_oku,
    sales_increase_oku_yen: sale.increase_oku,
    sales_growth_pct: sale.stated_cumulative_growth_pct ?? sale.stated_rate_pct,
    sales_cagr_pct: sale.calculated_cagr_pct ?? sale.reported_cagr_pct,
    sales_multiple: sale.multiple,
    sales_validation: sale.validation_status,
    pdf_url: item.pdf_url,
  };
  for (const [prefix, label] of Object.entries(metricAliases)) {
    for (const [suffix, value] of Object.entries(metricFields(metricMap.get(label)))) {
      row[`${prefix}_${suffix}`] = value;
    }
  }
  return row;
});

const caseColumns = [
  "case_id", "round", "company", "target_entity", "scope", "other_participants",
  "page_count", "vision_page_count", "project_page_count", "additional_page_count",
  "project_cost_million_yen", "subsidy_million_yen", "subsidy_rate_pct", "cost_page",
  "cost_source_method", "cost_validation", "cost_box_transcription",
  "sales_baseline_year", "sales_baseline_oku_yen", "sales_target_year", "sales_target_oku_yen",
  "sales_increase_oku_yen", "sales_growth_pct", "sales_cagr_pct", "sales_multiple", "sales_validation",
  ...Object.keys(metricAliases).flatMap((prefix) => [
    `${prefix}_base_year`, `${prefix}_base_value`, `${prefix}_target_year`, `${prefix}_target_value`,
    `${prefix}_unit`, `${prefix}_annual_rate_pct`, `${prefix}_validation`,
  ]),
  "pdf_url",
];

await writeCsv(path.join(out.processed, "cases.csv"), cases, caseColumns);

const metricColumns = [
  "case_id", "round", "company", "metric", "status", "base_year", "base_value", "target_year",
  "target_value", "unit", "listed_rate_pct", "calculated_rate_pct", "rate_diff_pt", "source_method",
  "page", "year_status", "issues", "raw_support", "raw",
];
await writeCsv(path.join(out.processed, "metrics.csv"), metricData.rows, metricColumns);
await writeCsv(path.join(out.processed, "validations.csv"), metricData.rows, metricColumns);

const salesColumns = [
  "case_id", "round", "company", "page", "page_role", "source_method", "confidence",
  "baseline_year", "baseline_sales_oku", "target_year", "target_sales_oku", "increase_oku",
  "increase_target_year", "stated_rate_pct", "stated_rate_target_year", "stated_rate_type",
  "stated_cumulative_growth_pct", "calculated_cagr_pct", "reported_cagr_pct", "multiple",
  "validation_status", "selection_score", "raw", "pdf_url",
];
await writeCsv(path.join(out.processed, "sales_targets.csv"), salesData.rows, salesColumns);

const salesAnnual = [];
for (const row of salesData.rows) {
  for (const value of row.sales_values ?? []) {
    salesAnnual.push({
      case_id: row.case_id,
      round: row.round,
      company: row.company,
      year: value.year,
      sales_oku_yen: value.value ?? value.sales_oku ?? value.oku_yen,
      raw: value.raw,
      page: row.page,
      pdf_url: row.pdf_url,
    });
  }
}
await writeCsv(path.join(out.processed, "sales_annual.csv"), salesAnnual, [
  "case_id", "round", "company", "year", "sales_oku_yen", "raw", "page", "pdf_url",
]);

const boxes = boxData.rows.map((row) => ({
  case_id: row.case_id,
  round: row.round,
  company: row.company,
  page: row.page,
  page_role: row.page_role,
  box_no: row.box_no,
  box_type: row.box_type,
  box_label: row.box_label,
  box_title: row.box_title,
  bbox_x1: row.bbox?.[0],
  bbox_y1: row.bbox?.[1],
  bbox_x2: row.bbox?.[2],
  bbox_y2: row.bbox?.[3],
  source_method: row.source_method,
  company_header_masked: row.company_header_masked,
  text: row.text,
  pdf_url: row.pdf_url,
}));
await writeCsv(path.join(out.processed, "boxes.csv"), boxes, Object.keys(boxes[0]));

await writeCsv(path.join(out.processed, "cost_validations.csv"), costData.rows, [
  "case_id", "round", "company", "page", "source_method", "box_transcription", "cost_million",
  "subsidy_million", "cost_unit", "subsidy_unit", "subsidy_rate_pct", "validation", "candidate_count", "pdf_url",
]);

const manifest = review.cases.map((item) => ({
  case_id: item.case_id,
  round: item.round,
  company: item.company,
  original_filename: path.basename(item.pdf_path || new URL(item.pdf_url).pathname),
  page_count: item.page_count,
  pdf_url: item.pdf_url,
}));
await writeCsv(path.join(out.processed, "pdf_manifest.csv"), manifest, Object.keys(manifest[0]));

const narratives = [];
const narrativeFields = [
  ["headline", "見出し・要旨"],
  ["top_summary_box_text", "上段要旨Box"],
  ["vision", "長期成長ビジョン"],
  ["external_motivation", "外発的動機"],
  ["internal_motivation", "内発的動機"],
  ["company_overview_box_text", "当社の概要"],
  ["sales_target_box_text", "売上成長目標"],
  ["other_box_text", "その他の記載"],
  ["vision_full_text", "長期成長ビジョン頁全文"],
  ["project_full_text", "補助事業概要頁全文"],
];
for (const item of review.cases) {
  for (const [field, section] of narrativeFields) {
    const value = item[field];
    if (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) continue;
    narratives.push({
      case_id: item.case_id,
      round: item.round,
      company: item.company,
      section,
      text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      pdf_url: item.pdf_url,
    });
  }
}
await writeJsonl(path.join(out.text, "narratives.jsonl"), narratives);
await writeJsonl(path.join(out.text, "pages.jsonl"), review.pages);

const htmlCases = review.cases.map((item) => {
  const numeric = cases.find((row) => row.case_id === item.case_id);
  return {
    ...numeric,
    local_pdf: `../local_assets/pdfs/${item.case_id}.pdf`,
    headline: item.headline ?? "",
    vision: item.vision ?? "",
    external_motivation: item.external_motivation ?? "",
    internal_motivation: item.internal_motivation ?? "",
    company_overview: item.company_overview_box_text ?? "",
    other_boxes: item.other_box_text ?? "",
  };
});
await writeJson(path.join(out.htmlData, "cases.json"), htmlCases);

const escapeScriptJson = (value) => JSON.stringify(value).replace(/<\//g, "<\\/");
const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>大規模成長投資補助金 1次～4次 採択案件データ</title>
<style>
:root{--ink:#17324d;--muted:#617286;--line:#d8e1ea;--bg:#f5f7fa;--card:#fff;--accent:#087f8c;--warm:#f2a541}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:"Yu Gothic UI","Noto Sans JP",sans-serif}
header{background:linear-gradient(120deg,#102f4c,#0b6875);color:#fff;padding:34px max(24px,5vw)}
header h1{margin:0 0 8px;font-size:clamp(24px,4vw,42px);letter-spacing:.02em}header p{margin:0;color:#d9f2f3}
main{max-width:1500px;margin:auto;padding:24px}.cards{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:12px;margin-top:-44px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px;box-shadow:0 6px 20px #0d2b4420}.card b{display:block;font-size:28px}.card span{color:var(--muted)}
.toolbar{display:grid;grid-template-columns:2fr 1fr 1fr auto auto;gap:10px;margin:22px 0 14px}.toolbar input,.toolbar select,.toolbar a{border:1px solid var(--line);border-radius:8px;padding:11px;background:#fff;color:var(--ink);font:inherit}.toolbar a{text-decoration:none;background:var(--accent);color:#fff;text-align:center}
.table-wrap{background:#fff;border:1px solid var(--line);border-radius:12px;overflow:auto;max-height:70vh}table{border-collapse:collapse;width:100%;min-width:1250px}th{position:sticky;top:0;background:#eaf2f5;z-index:1;text-align:left;font-size:13px;cursor:pointer}th,td{padding:10px;border-bottom:1px solid var(--line);vertical-align:top}td.num{text-align:right;font-variant-numeric:tabular-nums}tr:hover td{background:#f7fbfc}td a{color:#006f7a}.tag{display:inline-block;border-radius:999px;padding:2px 8px;background:#e4f4f2;color:#086c68;font-size:12px}.warn{background:#fff2d9;color:#875600}
details{max-width:420px}summary{cursor:pointer;color:#087f8c}.text{white-space:pre-wrap;color:#44576a;font-size:13px;margin-top:8px;max-height:240px;overflow:auto}
footer{color:var(--muted);padding:22px 0;font-size:13px}@media(max-width:850px){.cards{grid-template-columns:1fr 1fr}.toolbar{grid-template-columns:1fr}.card b{font-size:22px}}
</style>
</head>
<body>
<header><h1>大規模成長投資補助金</h1><p>1次～4次・採択案件の数値、記述、検証状況を横断検索</p></header>
<main>
<section class="cards"><div class="card"><b id="visibleCount">0</b><span>表示案件</span></div><div class="card"><b>381</b><span>全案件</span></div><div class="card"><b>887</b><span>PDFページ</span></div><div class="card"><b>1,995</b><span>分割Box</span></div></section>
<section class="toolbar"><input id="query" type="search" placeholder="会社名・ビジョン・動機・その他Boxを検索"><select id="round"><option value="">すべての回</option><option>1次</option><option>2次</option><option>3次</option><option>4次</option></select><select id="validation"><option value="">検証状態すべて</option><option value="整合">事業費：整合</option><option value="目視">事業費：目視検証</option><option value="補足">事業費：補足金額あり</option></select><a href="qa.html">データ確認</a><a href="../data/processed/cases.csv">案件CSV</a></section>
<div class="table-wrap"><table><thead><tr><th data-key="round">回</th><th data-key="company">企業名</th><th data-key="project_cost_million_yen">事業費<br>(百万円)</th><th data-key="subsidy_million_yen">補助額<br>(百万円)</th><th data-key="sales_growth_pct">売上成長率<br>(%)</th><th data-key="sales_cagr_pct">売上CAGR<br>(%)</th><th data-key="labor_annual_rate_pct">労働生産性<br>年平均(%)</th><th data-key="employee_pay_annual_rate_pct">従業員給与<br>年平均(%)</th><th>記述</th><th>PDF</th></tr></thead><tbody id="rows"></tbody></table></div>
<footer>公開PDFを基に機械抽出・Box分割・検算した研究用データです。利用時は必ず元PDFもご確認ください。</footer>
</main>
<script>
const DATA=${escapeScriptJson(htmlCases)};
const q=document.querySelector('#query'),round=document.querySelector('#round'),validation=document.querySelector('#validation'),tbody=document.querySelector('#rows'),count=document.querySelector('#visibleCount');let sortKey='round',sortAsc=true;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const num=v=>v===''||v==null?'':Number(v).toLocaleString('ja-JP',{maximumFractionDigits:2});
function render(){const term=q.value.trim().toLowerCase();let rows=DATA.filter(r=>(!round.value||r.round===round.value)&&(!validation.value||String(r.cost_validation).includes(validation.value))&&(!term||[r.company,r.target_entity,r.headline,r.vision,r.external_motivation,r.internal_motivation,r.company_overview,r.other_boxes].join('\\n').toLowerCase().includes(term)));rows.sort((a,b)=>{const av=a[sortKey]??'',bv=b[sortKey]??'';return(typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv),'ja'))*(sortAsc?1:-1)});count.textContent=rows.length.toLocaleString('ja-JP');tbody.innerHTML=rows.map(r=>'<tr><td><span class="tag">'+esc(r.round)+'</span></td><td>'+esc(r.company)+'<br><small>'+esc(r.cost_validation)+'</small></td><td class="num">'+num(r.project_cost_million_yen)+'</td><td class="num">'+num(r.subsidy_million_yen)+'</td><td class="num">'+num(r.sales_growth_pct)+'</td><td class="num">'+num(r.sales_cagr_pct)+'</td><td class="num">'+num(r.labor_annual_rate_pct)+'</td><td class="num">'+num(r.employee_pay_annual_rate_pct)+'</td><td><details><summary>表示</summary><div class="text"><b>長期成長ビジョン</b>\\n'+esc(r.vision)+'\\n\\n<b>外発的動機</b>\\n'+esc(r.external_motivation)+'\\n\\n<b>内発的動機</b>\\n'+esc(r.internal_motivation)+'\\n\\n<b>その他Box</b>\\n'+esc(r.other_boxes)+'</div></details></td><td><a href="'+esc(r.pdf_url)+'" target="_blank" rel="noopener">PDF</a></td></tr>').join('')}
[q,round,validation].forEach(el=>el.addEventListener('input',render));document.querySelectorAll('th[data-key]').forEach(th=>th.addEventListener('click',()=>{sortAsc=sortKey===th.dataset.key?!sortAsc:true;sortKey=th.dataset.key;render()}));render();
</script>
</body></html>`;
await fs.writeFile(path.join(out.html, "index.html"), html, "utf8");

const boxesByCase = new Map();
for (const row of boxes) {
  if (!boxesByCase.has(row.case_id)) boxesByCase.set(row.case_id, []);
  boxesByCase.get(row.case_id).push(row);
}
const qaCases = review.cases.map((item) => {
  const numeric = cases.find((row) => row.case_id === item.case_id);
  const cost = costs.get(item.case_id) ?? {};
  const sale = sales.get(item.case_id) ?? {};
  const metricRows = metricData.rows.filter((row) => row.case_id === item.case_id);
  const issueLabels = [];
  if (cost.validation !== "整合") issueLabels.push(`事業費: ${cost.validation || "未検証"}`);
  if (/不整合|抽出不能/.test(sale.validation_status ?? "")) issueLabels.push(`売上: ${sale.validation_status}`);
  for (const metric of metricRows) {
    if (/不整合|抽出不能|記載なし/.test(metric.status ?? "")) {
      issueLabels.push(`${metric.metric}: ${metric.status}`);
    }
  }
  return {
    ...numeric,
    local_pdf: `../local_assets/pdfs/${item.case_id}.pdf`,
    headline: item.headline ?? "",
    vision: item.vision ?? "",
    external_motivation: item.external_motivation ?? "",
    internal_motivation: item.internal_motivation ?? "",
    company_overview: item.company_overview_box_text ?? "",
    other_boxes: item.other_box_text ?? "",
    cost: {
      page: cost.page,
      transcription: cost.box_transcription,
      source_method: cost.source_method,
      validation: cost.validation,
      candidate_count: cost.candidate_count,
    },
    sales: sale,
    metrics: metricRows,
    boxes: boxesByCase.get(item.case_id) ?? [],
    issue_labels: issueLabels,
    issue_count: issueLabels.length,
  };
});

const qaHtml = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>抽出データ照合ワークベンチ</title>
<style>
:root{--navy:#142b42;--blue:#176b87;--cyan:#dff2f4;--paper:#f6f3ed;--card:#fff;--line:#d7dde2;--muted:#64717d;--ok:#18794e;--warn:#9a6700;--bad:#b42318}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--navy);font-family:"Yu Gothic UI","Noto Sans JP",sans-serif;font-size:14px}button,input,select,textarea{font:inherit}
.top{display:flex;align-items:center;gap:18px;padding:13px 20px;background:var(--navy);color:#fff;position:sticky;top:0;z-index:20}.top h1{font-size:19px;margin:0}.top .stats{display:flex;gap:16px;margin-left:auto}.top b{font-size:18px}.top small{color:#c9d9e6}
.filters{display:grid;grid-template-columns:2fr 110px 160px 150px auto;gap:8px;padding:10px 14px;background:#fff;border-bottom:1px solid var(--line);position:sticky;top:51px;z-index:19}.filters input,.filters select,.filters button{padding:9px;border:1px solid var(--line);border-radius:7px;background:#fff}.filters button{background:var(--blue);color:#fff;border-color:var(--blue);cursor:pointer}
.layout{display:grid;grid-template-columns:330px minmax(540px,1fr) minmax(480px,.9fr);height:calc(100vh - 104px)}.case-list{overflow:auto;border-right:1px solid var(--line);background:#fff}.case{padding:12px 14px;border-bottom:1px solid var(--line);cursor:pointer}.case:hover,.case.active{background:var(--cyan)}.case-head{display:flex;gap:8px;align-items:flex-start}.case-name{font-weight:700;flex:1}.pill{font-size:11px;border-radius:999px;padding:2px 7px;background:#e8edf1;white-space:nowrap}.pill.issue{background:#fff0d5;color:var(--warn)}.pill.ok{background:#dff4e8;color:var(--ok)}.case-meta{color:var(--muted);font-size:12px;margin-top:5px}.review-dot{width:8px;height:8px;border-radius:50%;background:#aeb8c1;display:inline-block;margin-right:5px}.review-dot.done{background:var(--ok)}.review-dot.recheck{background:var(--bad)}
.detail{overflow:auto;padding:16px}.detail-head{display:flex;align-items:flex-start;gap:12px}.detail-head h2{font-size:22px;margin:0 0 4px}.detail-head .actions{margin-left:auto;display:flex;gap:7px}.btn{padding:7px 10px;border:1px solid var(--line);background:#fff;border-radius:7px;color:var(--navy);text-decoration:none;cursor:pointer}.btn.primary{background:var(--blue);color:#fff;border-color:var(--blue)}
.review-panel{display:grid;grid-template-columns:auto auto auto 1fr;gap:7px;margin:12px 0;padding:10px;background:#edf2f5;border-radius:9px}.review-panel button.active{outline:3px solid #72b8c4}.review-panel textarea{min-height:38px;resize:vertical;border:1px solid var(--line);border-radius:6px;padding:7px}
.section{background:#fff;border:1px solid var(--line);border-radius:10px;margin:0 0 12px;overflow:hidden}.section h3{font-size:15px;margin:0;padding:9px 12px;background:#edf3f5;border-bottom:1px solid var(--line)}.section-body{padding:11px 12px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.kv{background:#f7f9fa;border-radius:7px;padding:8px}.kv label{display:block;color:var(--muted);font-size:11px}.kv b{font-size:16px;font-variant-numeric:tabular-nums}.raw{white-space:pre-wrap;line-height:1.65;color:#34495a;max-height:300px;overflow:auto}.issue-list{margin:0;padding-left:20px;color:var(--bad)}
table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid var(--line);padding:7px;text-align:left;vertical-align:top}th{font-size:11px;color:var(--muted);background:#fafbfc}td.num{text-align:right;font-variant-numeric:tabular-nums}.status{font-size:11px}.source{border:0;background:#e1eff3;color:#075a70;border-radius:5px;padding:3px 7px;cursor:pointer}
.box{border-left:4px solid #67a9b6;padding:8px 10px;margin:8px 0;background:#fafcfc}.box-title{display:flex;gap:8px;font-weight:700}.box .raw{max-height:220px}.pdf-pane{border-left:1px solid var(--line);background:#3e4852;display:flex;flex-direction:column}.pdf-bar{display:flex;gap:8px;align-items:center;padding:8px;background:#263747;color:#fff}.pdf-bar span{flex:1}.pdf-bar a{color:#fff}.pdf-pane iframe{border:0;width:100%;height:100%;background:#fff}.empty{padding:40px;text-align:center;color:var(--muted)}
@media(max-width:1150px){.layout{grid-template-columns:300px 1fr}.pdf-pane{display:none}.filters{grid-template-columns:1fr 90px 140px 130px}.filters button{display:none}}@media(max-width:760px){.top .stats{display:none}.layout{display:block;height:auto}.case-list{max-height:42vh}.filters{position:static;grid-template-columns:1fr 1fr}.detail{overflow:visible}.grid{grid-template-columns:1fr 1fr}.review-panel{grid-template-columns:1fr 1fr}.review-panel textarea{grid-column:1/-1}}
</style></head><body>
<header class="top"><h1>抽出データ照合ワークベンチ</h1><div class="stats"><span><b id="shown">381</b><small> 表示</small></span><span><b id="reviewed">0</b><small> 確認済</small></span><span><b id="rechecks">0</b><small> 要再確認</small></span></div></header>
<div class="filters"><input id="qaQuery" type="search" placeholder="企業名・文章・Box内容をスペース区切りAND検索"><select id="qaRound"><option value="">全回</option><option>1次</option><option>2次</option><option>3次</option><option>4次</option></select><select id="qaIssue"><option value="">全検証状態</option><option value="issue">課題候補あり</option><option value="clean">課題候補なし</option></select><select id="qaReview"><option value="">全確認状態</option><option value="unreviewed">未確認</option><option value="done">確認済</option><option value="recheck">要再確認</option></select><button id="exportReview">確認結果CSV</button></div>
<main class="layout"><aside id="caseList" class="case-list"></aside><article id="detail" class="detail"><div class="empty">左の案件を選択してください</div></article><aside class="pdf-pane"><div class="pdf-bar"><span id="pdfLabel">ローカルPDF</span><a id="pdfOpen" target="_blank" rel="noopener">ローカルPDFを開く</a><a id="pdfOfficial" target="_blank" rel="noopener">公式PDF</a></div><iframe id="pdfFrame" title="ローカルPDF"></iframe></aside></main>
<script>
const DATA=${escapeScriptJson(qaCases)};const STORE='growth-subsidy-qa-v1';let selected=location.hash.slice(1)||DATA[0].case_id;let reviews=JSON.parse(localStorage.getItem(STORE)||'{}');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const val=v=>v===null||v===undefined||v===''?'<span style="color:#9a6700">空欄</span>':esc(v);const num=v=>v===null||v===undefined||v===''?'—':Number(v).toLocaleString('ja-JP',{maximumFractionDigits:3});
const $=s=>document.querySelector(s);const query=$('#qaQuery'),round=$('#qaRound'),issue=$('#qaIssue'),review=$('#qaReview'),list=$('#caseList'),detail=$('#detail');
function reviewState(id){return reviews[id]||{status:'unreviewed',note:'',updated:''}}function saveState(id,state){reviews[id]={...reviewState(id),...state,updated:new Date().toISOString()};localStorage.setItem(STORE,JSON.stringify(reviews));renderList();renderStats()}
function filtered(){const terms=query.value.trim().toLowerCase().split(/\\s+/).filter(Boolean);return DATA.filter(r=>{const rs=reviewState(r.case_id);const hay=[r.company,r.target_entity,r.headline,r.vision,r.external_motivation,r.internal_motivation,r.company_overview,r.other_boxes,...r.boxes.map(b=>b.text)].join('\\n').toLowerCase();return(!round.value||r.round===round.value)&&(!issue.value||(issue.value==='issue'?r.issue_count>0:r.issue_count===0))&&(!review.value||rs.status===review.value)&&terms.every(term=>hay.includes(term))})}
function renderStats(){const states=Object.values(reviews);$('#reviewed').textContent=states.filter(x=>x.status==='done').length;$('#rechecks').textContent=states.filter(x=>x.status==='recheck').length}
function renderList(){const rows=filtered();$('#shown').textContent=rows.length;list.innerHTML=rows.map(r=>{const s=reviewState(r.case_id);return '<div class="case '+(r.case_id===selected?'active':'')+'" data-id="'+esc(r.case_id)+'"><div class="case-head"><span class="pill">'+esc(r.round)+'</span><span class="case-name">'+esc(r.company)+'</span>'+(r.issue_count?'<span class="pill issue">'+r.issue_count+'件</span>':'<span class="pill ok">候補なし</span>')+'</div><div class="case-meta"><span class="review-dot '+esc(s.status)+'"></span>'+({done:'確認済',recheck:'要再確認',unreviewed:'未確認'}[s.status])+' ・ '+r.page_count+'頁 ・ 事業費 '+num(r.project_cost_million_yen)+'百万円</div></div>'}).join('')||'<div class="empty">該当案件なし</div>';list.querySelectorAll('.case').forEach(el=>el.onclick=()=>selectCase(el.dataset.id))}
function metricTable(rows){return '<table><thead><tr><th>指標</th><th>基準</th><th>目標</th><th>年平均率</th><th>検証</th><th>出典</th></tr></thead><tbody>'+rows.map(m=>'<tr><td><b>'+esc(m.metric)+'</b><br><small>'+esc(m.unit||'')+'</small></td><td class="num">'+val(m.base_year)+'<br>'+val(m.base_value)+'</td><td class="num">'+val(m.target_year)+'<br>'+val(m.target_value)+'</td><td class="num">'+val(m.listed_rate_pct??m.calculated_rate_pct)+'</td><td class="status">'+esc(m.status)+'<br><span style="color:#64717d">'+esc(m.issues||'')+'</span></td><td><button class="source" data-page="'+(m.page||1)+'">p.'+(m.page||1)+'</button></td></tr>').join('')+'</tbody></table>'}
function boxHtml(boxes){return boxes.map(b=>'<div class="box"><div class="box-title"><span>p.'+b.page+' / Box '+b.box_no+'</span><span class="pill">'+esc(b.box_label||b.box_type)+'</span><button class="source" data-page="'+b.page+'">PDFで確認</button></div><div class="raw">'+esc(b.text)+'</div><small>'+esc(b.source_method)+' ・ bbox ['+[b.bbox_x1,b.bbox_y1,b.bbox_x2,b.bbox_y2].map(num).join(', ')+']</small></div>').join('')}
function section(title,body){return '<section class="section"><h3>'+title+'</h3><div class="section-body">'+body+'</div></section>'}
function numeric(v){return v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v)}
function salesRateType(s){return String(s.stated_rate_type||'未分類')}
function salesGrowthRate(s){return numeric(s.stated_cumulative_growth_pct)??(salesRateType(s).includes('CAGR')?null:numeric(s.stated_rate_pct))}
function salesCagrRate(s){return numeric(s.reported_cagr_pct)??(salesRateType(s).includes('CAGR')?numeric(s.stated_rate_pct):numeric(s.calculated_cagr_pct))}
function salesEstimate(s){const increase=numeric(s.increase_oku),rate=numeric(s.stated_cumulative_growth_pct)??numeric(s.stated_rate_pct);if(increase===null||increase<=0)return '';let base=numeric(s.baseline_sales_oku),target=numeric(s.target_sales_oku),method='';if(base!==null&&target===null){target=base+increase;method='基準売上＋増加額'}else if(base===null&&target!==null){base=target-increase;method='目標売上－増加額'}else if(base===null&&target===null&&rate!==null&&rate>0){const type=salesRateType(s);if(type.includes('CAGR'))return '<div class="raw"><b>逆算参考値</b>\\n逆算保留：CAGRは増加額との単純計算ができません。</div>';if(type.includes('目標/基準比')){const multiple=rate/100;if(multiple<=1)return '';base=increase/(multiple-1);target=base+increase;method='PDF表記の目標/基準比から逆算'}else{base=increase/(rate/100);target=base+increase;method=type.includes('累積成長率')?'累積成長率から逆算':'成長率＝増加額÷基準売上と仮定した参考試算'}}else{return ''}return '<div class="raw"><b>逆算参考値（PDF明記値ではありません）</b>\\n基準売上：約'+num(base)+'億円 / 目標売上：約'+num(target)+'億円\\n算出方法：'+esc(method)+'</div>'}
function selectCase(id){selected=id;location.hash=id;const r=DATA.find(x=>x.case_id===id);if(!r)return;const s=reviewState(id);const sales=r.sales||{};detail.innerHTML='<div class="detail-head"><div><h2>'+esc(r.company)+'</h2><div>'+esc(r.round)+' ・ '+r.page_count+'頁 ・ ID '+esc(r.case_id)+'</div></div><div class="actions"><a class="btn" href="../data/processed/cases.csv">案件CSV</a><a class="btn" href="'+esc(r.local_pdf)+'" target="_blank" rel="noopener">ローカルPDF</a><a class="btn primary" href="'+esc(r.pdf_url)+'" target="_blank" rel="noopener">公式PDF</a></div></div><div class="review-panel"><button class="btn '+(s.status==='unreviewed'?'active':'')+'" data-status="unreviewed">未確認</button><button class="btn '+(s.status==='done'?'active':'')+'" data-status="done">✓ 確認済</button><button class="btn '+(s.status==='recheck'?'active':'')+'" data-status="recheck">⚠ 要再確認</button><textarea id="reviewNote" placeholder="確認メモ（このブラウザ内に保存）">'+esc(s.note)+'</textarea></div>'+(r.issue_count?section('自動検出された確認候補','<ul class="issue-list">'+r.issue_labels.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>'):section('自動検出された確認候補','<span style="color:#18794e">大きな不整合候補は検出されていません。</span>'))+section('事業費・補助額','<div class="grid"><div class="kv"><label>事業費</label><b>'+num(r.project_cost_million_yen)+' 百万円</b></div><div class="kv"><label>補助額</label><b>'+num(r.subsidy_million_yen)+' 百万円</b></div><div class="kv"><label>補助率</label><b>'+num(r.subsidy_rate_pct)+'%</b></div></div><p><b>検証：</b>'+esc(r.cost.validation||'')+' ・ <button class="source" data-page="'+(r.cost.page||1)+'">p.'+(r.cost.page||1)+'</button></p><div class="raw">'+esc(r.cost.transcription||'')+'</div>')+section('売上成長目標','<div class="grid"><div class="kv"><label>基準年度・売上</label><b>'+val(sales.baseline_year)+' / '+num(sales.baseline_sales_oku)+'億円</b></div><div class="kv"><label>目標年度・売上</label><b>'+val(sales.target_year)+' / '+num(sales.target_sales_oku)+'億円</b></div><div class="kv"><label>売上高増加額</label><b>'+num(sales.increase_oku)+'億円</b></div><div class="kv"><label>売上高成長率</label><b>'+num(salesGrowthRate(sales))+'%</b></div><div class="kv"><label>CAGR（明記／計算）</label><b>'+num(salesCagrRate(sales))+'%</b></div><div class="kv"><label>率の種類</label><b>'+esc(salesRateType(sales))+'</b></div></div>'+salesEstimate(sales)+'<p><b>検証：</b>'+esc(sales.validation_status||'')+' ・ <button class="source" data-page="'+(sales.page||1)+'">p.'+(sales.page||1)+'</button></p><div class="raw">'+esc(sales.raw||'')+'</div>')+section('主要4指標',metricTable(r.metrics))+section('Box分割結果（'+r.boxes.length+'Box）',boxHtml(r.boxes))+section('長期成長ビジョン・動機の抽出結果','<h4>長期成長ビジョン</h4><div class="raw">'+esc(r.vision)+'</div><h4>外発的動機</h4><div class="raw">'+esc(r.external_motivation)+'</div><h4>内発的動機</h4><div class="raw">'+esc(r.internal_motivation)+'</div><h4>その他Box</h4><div class="raw">'+esc(r.other_boxes)+'</div>');detail.querySelectorAll('[data-status]').forEach(b=>b.onclick=()=>{saveState(id,{status:b.dataset.status,note:$('#reviewNote').value});selectCase(id)});$('#reviewNote').onchange=e=>saveState(id,{note:e.target.value});detail.querySelectorAll('.source').forEach(b=>b.onclick=()=>showPdf(r,b.dataset.page));showPdf(r,1);renderList()}
function showPdf(r,page){const pageNo=page||1;const localUrl=r.local_pdf+'#page='+pageNo;$('#pdfFrame').src=localUrl;$('#pdfOpen').href=localUrl;$('#pdfOfficial').href=r.pdf_url+'#page='+pageNo;$('#pdfLabel').textContent=r.company+' / p.'+pageNo}
function exportReviews(){const head=['case_id','round','company','review_status','note','updated','issue_count'];const lines=[head.join(',')];DATA.forEach(r=>{const s=reviewState(r.case_id);lines.push([r.case_id,r.round,r.company,s.status,s.note,s.updated,r.issue_count].map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(','))});const blob=new Blob(['\ufeff'+lines.join('\\r\\n')],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='review_results.csv';a.click();URL.revokeObjectURL(a.href)}
[query,round,issue,review].forEach(el=>el.addEventListener('input',renderList));$('#exportReview').onclick=exportReviews;renderStats();renderList();selectCase(selected);
</script></body></html>`;
await fs.writeFile(path.join(out.html, "qa.html"), qaHtml, "utf8");

const schema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  title: "大規模成長投資補助金・案件マスタ",
  type: "object",
  required: ["case_id", "round", "company", "pdf_url"],
  properties: Object.fromEntries(caseColumns.map((name) => [name, {
    type: ["string", "number", "null"],
    description: name === "case_id" ? "抽出系内で一意の案件ID" : undefined,
  }])),
};
await writeJson(path.join(out.schemas, "cases.schema.json"), schema);

const readme = `# 大規模成長投資補助金 1次～4次・交付決定企業公開PDFデータ

「中堅・中小成長投資補助金」の公式サイトで公開された交付決定企業の取組概要PDFを基に、数値、文章、ページ構成、Box分割結果、検証状態を整理した非公式の研究用データセットです。

## データの出所

交付決定企業の一覧と個別PDF URLは、以下の公式公表ページから取得しました。

| 対象 | 公式公表ページ | 本データのPDF数 | ページ数 |
|---|---|---:|---:|
| 1次 | [1・2次：補助金交付が決定した企業](https://seichotoushi-hojo.jp/1_2ji/koufu/) | 156 | 356 |
| 2次 | [1・2次：補助金交付が決定した企業](https://seichotoushi-hojo.jp/1_2ji/koufu/) | 25 | 63 |
| 3次 | [3・4次：補助金交付が決定した企業](https://seichotoushi-hojo.jp/koufu/) | 107 | 257 |
| 4次 | [3・4次：補助金交付が決定した企業](https://seichotoushi-hojo.jp/koufu/) | 93 | 211 |
| **合計** |  | **381** | **887** |

- 初版の取得・整理日：2026-07-13～2026-07-14
- 個別PDFの公式URLは \`data/processed/pdf_manifest.csv\` と各データの \`pdf_url\` 列に保持しています。
- 公式公表ページは「随時更新」とされているため、将来の掲載件数・PDF内容と本データのスナップショットは異なる可能性があります。
- 公式サイトの注記どおり、取組概要PDFの事業費・補助額などは交付申請時点の情報を含み、実績報告後に更新される場合があります。

## 公式中央値資料

公開PDFから再構成した指標と、公式が公表した採択者・申請者全体の中央値を比較する際は、以下を参照しました。

- [1次公募における各種指標の中央値](https://seichotoushi-hojo.jp/assets/pdf/ichiji.pdf)
- [2次公募における各種指標の中央値](https://seichotoushi-hojo.jp/assets/pdf/niji.pdf)
- [1次・2次公募全体における各種指標の中央値](https://seichotoushi-hojo.jp/assets/pdf/information/20250122.pdf)
- [3次公募における各種指標の中央値](https://seichotoushi-hojo.jp/assets/pdf/3ji_median.pdf)
- [4次公募における各種指標の中央値](https://seichotoushi-hojo.jp/assets/pdf/4ji_median.pdf)

公式中央値の「採択者」と、本データが対象とする「HPで取組概要PDFが公開された交付決定企業」は同一母集団とは限りません。また、同じ指標名でも対象企業、対象範囲、基準年、計画期間が異なる場合があるため、比較時は定義を併記してください。

## 収録範囲

- 交付決定企業の取組概要PDF：381件・887ページ
- ページ内Box：1,995件
- 主要4指標：1,524行（381案件 × 4指標）
- 長期成長ビジョン、外発的動機、内発的動機、会社概要、その他Box等の原文
- 事業費、補助額、売上成長目標、労働生産性、従業員給与、役員給与、従業員数

## まず見るファイル

- \`data/processed/cases.csv\`: 1案件1行の案件マスタ
- \`data/processed/metrics.csv\`: 主要4指標の縦持ちデータ
- \`data/processed/sales_targets.csv\`: 売上成長目標Boxの選択済み抽出結果
- \`data/processed/sales_annual.csv\`: PDFに明記された年次売上高の縦持ちデータ
- \`data/processed/boxes.csv\`: ページ内Boxごとの文章・座標・分類
- \`data/processed/pdf_manifest.csv\`: 公式PDF URL、元ファイル名、ページ数の台帳
- \`data/text/narratives.jsonl\`: 文章セクションごとの原文
- \`data/text/pages.jsonl\`: PDF 1ページ1行の全文データ
- \`html/index.html\`: 案件の検索・一覧用ローカルHTML
- \`html/qa.html\`: ローカルPDFと抽出値・Box原文を照合する確認用HTML
- \`excel/大規模成長投資補助金_1次～4次_統合データ.xlsx\`: 検証済みExcelスナップショット

## 作成方法の概要

1. 公式公表ページから個別PDF URLを収集。
2. PDFをページ単位で解析し、テキスト、表セル、図形・矩形座標を取得。
3. ページ内の座標を使って文章をBoxごとに分離し、会社名ヘッダーの混入を除外。
4. 事業費・補助額、売上成長目標、主要4指標を構造化。
5. 単位変換、成長率・CAGR・補助率の再計算、年度順序の確認、一部案件の目視確認を実施。
6. 個々のレコードに検証状態、根拠原文、出典ページ、公式PDF URLを保持。

詳細は \`docs/methodology.md\`、列定義は \`docs/data_dictionary.md\`、検証内容は \`docs/validation.md\` を参照してください。

## 重要な注意点

- 本リポジトリは経済産業省・補助金事務局の公式データセットではありません。
- 本データに含まれるのは公開PDFのある交付決定企業です。不採択案件がないため、このデータ単独から採択確率や審査上の因果効果は推定できません。
- 数値と文章は機械抽出後にBox位置、表セル、数式検算、一部目視確認で検証していますが、誤抽出が残る可能性があります。重要な判断に使う場合は必ず元PDFを確認してください。
- 空欄は必ずしも「記載なし」を意味しません。抽出不能、対象外、年平均率のみ記載等を含むため、検証状態列も併せて確認してください。
- 親会社、子会社、共同申請者等が併記される場合、数値の対象範囲が申請企業単体とは限りません。\`target_entity\` と \`scope\` を確認してください。

## 著作権・利用上の注意

収録元のPDF・文章・図表の著作権や利用条件は、各公開元に帰属します。本リポジトリはPDF本体をGitに収録せず、出典URLと抽出・構造化したデータを保持します。利用者は公開元の条件と適用法令を確認してください。

## 再生成

\`node scripts/build_dataset.mjs --source-dir <抽出作業ディレクトリ>\`

## ローカルPDFの準備

\`node scripts/prepare_local_pdfs.mjs --source-dir <抽出作業ディレクトリ>\`

\`local_assets/\` は \`.gitignore\` 対象です。確認用HTMLはこのフォルダのPDFを相対パスで表示します。

## 確認用HTMLの使い方

プロジェクトディレクトリでローカルHTTPサーバーを起動します。

\`python -m http.server 8000\`

ブラウザで \`http://localhost:8000/html/qa.html\` を開いてください。検索欄はスペース区切りのAND検索です。例えば \`半導体 2029年 売上\` と入力すると、すべての語を案件内に含む企業だけを表示します。確認状態とメモはブラウザのローカルストレージに保存され、［確認結果CSV］から書き出せます。
`;
await fs.writeFile(path.join(projectDir, "README.md"), readme, "utf8");

const methodology = `# 作成方法

1. 公式公表ページから1次～4次のPDF URLを収集。
2. PDFをページごとに解析し、テキスト、表セル、図形・矩形座標を取得。
3. 長期成長ビジョン、外発的動機、内発的動機、売上成長目標、その他Boxを座標で分離。
4. 事業費・補助額は「事業費（補助額）」Boxを優先し、金額単位を百万円に正規化。
5. 売上高は売上成長目標Boxを優先し、基準年・基準値・目標年・目標値・増加額・成長率を抽出。
6. 労働生産性、従業員給与、役員給与、従業員数は表セルを再構成し、年平均率と数式の整合性を検算。
7. 会社名ヘッダー混入やBox外文章の混入を除き、検証状態を各レコードに保持。
`;
await fs.writeFile(path.join(out.docs, "methodology.md"), methodology, "utf8");

const dictionary = `# データ辞書

## 共通キー

- \`case_id\`: 抽出系内の案件ID。
- \`round\`: 公募回（1次～4次）。
- \`company\`: PDFに記載された企業名。
- \`pdf_url\`: 公式PDFへのURL。

## 主な単位

- \`*_million_yen\`: 百万円。
- \`*_oku_yen\`: 億円。
- \`*_pct\`: パーセント値。例：5.2は5.2%。
- \`bbox_x1/y1/x2/y2\`: PDFページ上のBox座標。

## テーブル粒度

- \`cases.csv\`: 1案件1行。
- \`metrics.csv\`: 1案件×1指標1行。原則と1案件4行。
- \`sales_targets.csv\`: 1案件1行の選択済み売上目標。
- \`sales_annual.csv\`: 1案件×1売上年1行。
- \`boxes.csv\`: 1ページ×1Box1行。
- \`narratives.jsonl\`: 1案件×1文章セクション1行。
- \`pages.jsonl\`: PDF 1ページ1行。
`;
await fs.writeFile(path.join(out.docs, "data_dictionary.md"), dictionary, "utf8");

const validation = `# 検証方法と注意点

## 実施済み

- 案件数、PDFページ数、Box数、指標行数の一致確認。
- 事業費・補助額のBox再抽出、補助率検算、補足金額を含むBoxの分類。
- 売上成長目標のBox選択、基準値・目標値からの成長率/CAGR検算。
- 主要4指標の表セル再構成、基準年・目標年の順序、年平均率と計算値の差分確認。
- 役員給与の「絶対値なし・年平均率のみ」を別状態として保持。
- ページ内Box座標による文章分離と会社名ヘッダー除外。
- 一部の不整合・難抽出案件は元PDF画像を目視確認。

## 利用上の注意

検証状態が「記載なし又は抽出不能」「原本内不整合」等の場合は、欠損を0と扱わず、元PDFを参照してください。採否を説明する公式な審査データではないため、このデータ単独から「採択される数値」を断定できません。
`;
await fs.writeFile(path.join(out.docs, "validation.md"), validation, "utf8");

const excelSource = path.join(outputDir, "大規模成長投資補助金_1次～4次_事業費補助額Box再検証_売上主要4指標検証済_Excel検証済.xlsx");
await fs.copyFile(excelSource, path.join(out.excel, "大規模成長投資補助金_1次～4次_統合データ.xlsx"));

const stats = {
  cases: cases.length,
  pages: review.pages.length,
  boxes: boxes.length,
  metrics: metricData.rows.length,
  sales_targets: salesData.rows.length,
  sales_annual: salesAnnual.length,
  narratives: narratives.length,
  generated_at: new Date().toISOString(),
};
await writeJson(path.join(projectDir, "dataset_stats.json"), stats);
console.log(JSON.stringify(stats, null, 2));
