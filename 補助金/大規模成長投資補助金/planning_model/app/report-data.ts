import { balanceSheetDerived, operatingProfit, total, valueAdded, YEAR_ROLE_LABELS, type BalanceSheetPlan, type SegmentPlan, type YearPlan } from "./model";

export type ReportRow = { code: string; label: string; unit: string; values: (number | undefined)[]; emphasis?: boolean };
export type DiagnosticReportRow = { name: string; formula: string; check: string; unit: string; values: { label: string; value: number | undefined }[][] };
export type DiagnosticReportGroup = { title: string; rows: DiagnosticReportRow[] };

const rate = (numerator: number, denominator: number) => denominator ? numerator / denominator * 100 : undefined;
const multiple = (numerator: number, denominator: number) => denominator ? numerator / denominator : undefined;
const growth = (current: number, previous?: number) => previous ? (current / previous - 1) * 100 : undefined;
const company = (row: YearPlan) => total(row.project, row.other);
const sga = (segment: SegmentPlan) => segment.employeePay + segment.officerPay + segment.depreciation + segment.otherSga;
const ebitda = (segment: SegmentPlan) => operatingProfit(segment) + segment.depreciation;

export function buildBalanceSheetRows(balanceSheets: BalanceSheetPlan[], plan: YearPlan[]): ReportRow[] {
  const values = (getter: (row: BalanceSheetPlan, index: number) => number | undefined) => balanceSheets.map(getter);
  const derived = (row: BalanceSheetPlan, index: number) => balanceSheetDerived(row, ebitda(company(plan[index])));
  return [
    { code: "1-1", label: "資産総額", unit: "億円", values: values((row) => row.assets), emphasis: true },
    { code: "1-2", label: "うち流動資産", unit: "億円", values: values((row) => row.currentAssets) },
    { code: "1-3", label: "うち現金及び預金", unit: "億円", values: values((row) => row.cash) },
    { code: "1-4", label: "うち固定資産", unit: "億円", values: values((row) => row.fixedAssets) },
    { code: "1-5", label: "うち有形固定資産", unit: "億円", values: values((row) => row.tangibleAssets) },
    { code: "1-6", label: "うち建物及び構築物", unit: "億円", values: values((row) => row.buildings) },
    { code: "1-7", label: "うち機械装置等", unit: "億円", values: values((row) => row.machinery) },
    { code: "1-8", label: "うち土地", unit: "億円", values: values((row) => row.land) },
    { code: "1-9", label: "うち無形固定資産", unit: "億円", values: values((row) => row.intangibleAssets) },
    { code: "1-10", label: "うちソフトウェア", unit: "億円", values: values((row) => row.software) },
    { code: "1-11", label: "その他資産（自動計算）", unit: "億円", values: values((row, index) => derived(row, index).otherAssets) },
    { code: "1-12", label: "負債及び純資産合計（自動計算）", unit: "億円", values: values((row, index) => derived(row, index).liabilitiesAndNetAssets), emphasis: true },
    { code: "1-13", label: "負債総額", unit: "億円", values: values((row) => row.liabilities) },
    { code: "1-14", label: "うち流動負債", unit: "億円", values: values((row) => row.currentLiabilities) },
    { code: "1-15", label: "うち短期借入金", unit: "億円", values: values((row) => row.shortTermDebt) },
    { code: "1-16", label: "うち固定負債", unit: "億円", values: values((row) => row.fixedLiabilities) },
    { code: "1-17", label: "うち長期借入金", unit: "億円", values: values((row) => row.longTermDebt) },
    { code: "1-18", label: "その他負債（自動計算）", unit: "億円", values: values((row, index) => derived(row, index).otherLiabilities) },
    { code: "1-19", label: "純資産総額", unit: "億円", values: values((row) => row.netAssets), emphasis: true },
    { code: "1-20", label: "うち株主資本", unit: "億円", values: values((row) => row.shareholderEquity) },
    { code: "1-21", label: "うち資本金", unit: "億円", values: values((row) => row.capital) },
    { code: "1-22", label: "その他純資産（自動計算）", unit: "億円", values: values((row, index) => derived(row, index).otherNetAssets) },
    { code: "1-23", label: "自己資本比率（自動計算）", unit: "%", values: values((row, index) => derived(row, index).equityRatio) },
    { code: "1-24", label: "新規設備投資による支出", unit: "億円", values: values((row) => row.capex) },
    { code: "1-25", label: "EBITDA有利子負債倍率（自動計算）", unit: "倍", values: values((row, index) => derived(row, index).ebitdaDebtMultiple) },
  ];
}

export function buildCompanyPlRows(plan: YearPlan[]): ReportRow[] {
  const values = (getter: (row: YearPlan, index: number) => number | undefined) => plan.map(getter);
  return [
    { code: "2-1", label: "売上高", unit: "億円", values: values((row) => company(row).sales), emphasis: true },
    { code: "2-2", label: "売上高成長率", unit: "%", values: values((row, index) => growth(company(row).sales, index ? company(plan[index - 1]).sales : undefined)) },
    { code: "2-3", label: "売上原価", unit: "億円", values: values((row) => company(row).cogs) },
    { code: "2-4", label: "うち減価償却費", unit: "億円", values: values(() => 0) },
    { code: "2-5", label: "売上総利益", unit: "億円", values: values((row) => company(row).sales - company(row).cogs), emphasis: true },
    { code: "2-6", label: "売上総利益率", unit: "%", values: values((row) => rate(company(row).sales - company(row).cogs, company(row).sales)) },
    { code: "2-7", label: "販売費及び一般管理費", unit: "億円", values: values((row) => sga(company(row))) },
    { code: "2-8", label: "うち役員の人件費", unit: "億円", values: values((row) => company(row).officerPay) },
    { code: "2-9", label: "うち役員報酬", unit: "億円", values: values((row) => company(row).officerPay) },
    { code: "2-10", label: "うち役員賞与", unit: "億円", values: values(() => 0) },
    { code: "2-11", label: "うち従業員の人件費", unit: "億円", values: values((row) => company(row).employeePay) },
    { code: "2-12", label: "うち従業員の給与", unit: "億円", values: values((row) => company(row).employeePay) },
    { code: "2-13", label: "うち従業員の賞与", unit: "億円", values: values(() => 0) },
    { code: "2-14", label: "うち減価償却費", unit: "億円", values: values((row) => company(row).depreciation) },
    { code: "2-15", label: "うち研究開発費", unit: "億円", values: values(() => 0) },
    { code: "2-16", label: "営業利益", unit: "億円", values: values((row) => operatingProfit(company(row))), emphasis: true },
    { code: "2-17", label: "営業利益率", unit: "%", values: values((row) => rate(operatingProfit(company(row)), company(row).sales)) },
    { code: "2-18", label: "経常利益", unit: "億円", values: values((row) => operatingProfit(company(row))), emphasis: true },
    { code: "2-19", label: "税引前当期純利益（モデル未対応）", unit: "億円", values: values(() => undefined) },
    { code: "2-20", label: "当期純利益（モデル未対応）", unit: "億円", values: values(() => undefined) },
    { code: "2-21", label: "給与支給総額（常時使用する従業員）", unit: "億円", values: values((row) => company(row).employeePay) },
    { code: "2-22", label: "給与支給総額（役員）", unit: "億円", values: values((row) => company(row).officerPay) },
    { code: "2-23", label: "減価償却費（合計）", unit: "億円", values: values((row) => company(row).depreciation) },
    { code: "2-24", label: "付加価値額", unit: "億円", values: values((row) => valueAdded(company(row))), emphasis: true },
    { code: "2-25", label: "付加価値増加率", unit: "%", values: values((row, index) => growth(valueAdded(company(row)), index ? valueAdded(company(plan[index - 1])) : undefined)) },
    { code: "2-26", label: "売上高付加価値率", unit: "%", values: values((row) => rate(valueAdded(company(row)), company(row).sales)) },
    { code: "2-27", label: "常時使用する従業員数（就業時間換算）", unit: "人", values: values((row) => company(row).headcount) },
    { code: "2-28", label: "役員数", unit: "人", values: values((row) => company(row).officerCount) },
    { code: "2-29", label: "従業員1人当たり給与支給総額", unit: "億円/人", values: values((row) => multiple(company(row).employeePay, company(row).headcount)) },
    { code: "2-30", label: "従業員1人当たり給与支給総額の上昇率", unit: "%", values: values((row, index) => growth(multiple(company(row).employeePay, company(row).headcount) ?? 0, index ? multiple(company(plan[index - 1]).employeePay, company(plan[index - 1]).headcount) : undefined)) },
    { code: "2-31", label: "役員1人当たり給与支給総額", unit: "億円/人", values: values((row) => multiple(company(row).officerPay, company(row).officerCount)) },
    { code: "2-32", label: "役員1人当たり給与支給総額の上昇率", unit: "%", values: values((row, index) => growth(multiple(company(row).officerPay, company(row).officerCount) ?? 0, index ? multiple(company(plan[index - 1]).officerPay, company(plan[index - 1]).officerCount) : undefined)) },
    { code: "2-33", label: "労働生産性", unit: "億円/人", values: values((row) => multiple(valueAdded(company(row)), company(row).headcount + company(row).officerCount)) },
    { code: "2-34", label: "EBITDA", unit: "億円", values: values((row) => ebitda(company(row))), emphasis: true },
    { code: "2-35", label: "EBITDAマージン", unit: "%", values: values((row) => rate(ebitda(company(row)), company(row).sales)) },
    { code: "2-36", label: "EBITDA増加率", unit: "%", values: values((row, index) => growth(ebitda(company(row)), index ? ebitda(company(plan[index - 1])) : undefined)) },
  ];
}

export function buildProjectPlRows(plan: YearPlan[], marketGrowth: number): ReportRow[] {
  const values = (getter: (row: YearPlan, index: number) => number | undefined) => plan.map(getter);
  return [
    { code: "7-1", label: "売上高", unit: "億円", values: values((row) => row.project.sales), emphasis: true },
    { code: "7-2", label: "売上高成長率", unit: "%", values: values((row, index) => growth(row.project.sales, index ? plan[index - 1].project.sales : undefined)) },
    { code: "7-3", label: "全社売上高に占める補助事業売上高の割合", unit: "%", values: values((row) => rate(row.project.sales, company(row).sales)) },
    { code: "7-4", label: "売上総利益", unit: "億円", values: values((row) => row.project.sales - row.project.cogs), emphasis: true },
    { code: "7-5", label: "売上総利益率", unit: "%", values: values((row) => rate(row.project.sales - row.project.cogs, row.project.sales)) },
    { code: "7-6", label: "営業利益", unit: "億円", values: values((row) => operatingProfit(row.project)), emphasis: true },
    { code: "7-7", label: "営業利益率", unit: "%", values: values((row) => rate(operatingProfit(row.project), row.project.sales)) },
    { code: "7-8", label: "給与支給総額（常時使用する従業員）", unit: "億円", values: values((row) => row.project.employeePay) },
    { code: "7-9", label: "給与支給総額（役員）", unit: "億円", values: values((row) => row.project.officerPay) },
    { code: "7-10", label: "減価償却費（合計）", unit: "億円", values: values((row) => row.project.depreciation) },
    { code: "7-11", label: "付加価値", unit: "億円", values: values((row) => valueAdded(row.project)), emphasis: true },
    { code: "7-12", label: "付加価値増加率", unit: "%", values: values((row, index) => growth(valueAdded(row.project), index ? valueAdded(plan[index - 1].project) : undefined)) },
    { code: "7-13", label: "常時使用する従業員数（就業時間換算）", unit: "人", values: values((row) => row.project.headcount) },
    { code: "7-14", label: "役員数", unit: "人", values: values((row) => row.project.officerCount) },
    { code: "7-15", label: "従業員1人当たり給与支給総額", unit: "億円/人", values: values((row) => multiple(row.project.employeePay, row.project.headcount)) },
    { code: "7-16", label: "従業員1人当たり給与支給総額の上昇率", unit: "%", values: values((row, index) => growth(multiple(row.project.employeePay, row.project.headcount) ?? 0, index ? multiple(plan[index - 1].project.employeePay, plan[index - 1].project.headcount) : undefined)) },
    { code: "7-17", label: "役員1人当たり給与支給総額", unit: "億円/人", values: values((row) => multiple(row.project.officerPay, row.project.officerCount)) },
    { code: "7-18", label: "役員1人当たり給与支給総額の上昇率", unit: "%", values: values((row, index) => growth(multiple(row.project.officerPay, row.project.officerCount) ?? 0, index ? multiple(plan[index - 1].project.officerPay, plan[index - 1].project.officerCount) : undefined)) },
    { code: "7-19", label: "労働生産性", unit: "億円/人", values: values((row) => multiple(valueAdded(row.project), row.project.headcount + row.project.officerCount)) },
    { code: "7-20", label: "市場伸び率（年あたり）", unit: "%", values: values((_row, index) => index === 0 ? marketGrowth * 100 : undefined) },
  ];
}

export function buildDiagnosticGroups(plan: YearPlan[], balanceSheets: BalanceSheetPlan[], futureCapex: { year: number; value: number }[]): DiagnosticReportGroup[] {
  const segments = (row: YearPlan) => [{ label: "全社", value: company(row) }, { label: "補助", value: row.project }, { label: "他", value: row.other }];
  const segmentValues = (row: YearPlan, calculator: (segment: SegmentPlan) => number | undefined) => segments(row).map((entry) => ({ label: entry.label, value: calculator(entry.value) }));
  const pairedValues = (row: YearPlan, calculator: (segment: SegmentPlan) => number | undefined) => [{ label: "補助", value: calculator(row.project) }, { label: "他", value: calculator(row.other) }];
  const previous = (index: number, key: "company" | "project" | "other") => !index ? undefined : key === "company" ? company(plan[index - 1]) : plan[index - 1][key];
  const capex = new Map<number, number>([...balanceSheets.map((row) => [row.year, row.capex] as [number, number]), ...futureCapex.map((row) => [row.year, row.value] as [number, number])]);
  const perEmployee = (amount: number, segment: SegmentPlan) => multiple(amount, segment.headcount);
  const payPerEmployee = (segment: SegmentPlan) => perEmployee(segment.employeePay, segment);
  const opMargin = (segment: SegmentPlan) => rate(operatingProfit(segment), segment.sales);
  const make = (name: string, formula: string, check: string, unit: string, calculator: (row: YearPlan, index: number) => { label: string; value: number | undefined }[]): DiagnosticReportRow => ({ name, formula, check, unit, values: plan.map(calculator) });
  return [
    { title: "1. 収益性", rows: [
      make("売上高成長率", "当年売上高 ÷ 前年売上高－1", "売上が能力・人員を超えて急増していないか", "%", (row, index) => segments(row).map((entry) => { const key = entry.label === "全社" ? "company" : entry.label === "補助" ? "project" : "other"; return { label: entry.label, value: growth(entry.value.sales, previous(index, key)?.sales) }; })),
      make("売上原価率", "売上原価 ÷ 売上高", "原価率が過去実績から急改善していないか", "%", (row) => segmentValues(row, (s) => rate(s.cogs, s.sales))),
      make("売上総利益率", "（売上高－売上原価）÷ 売上高", "価格・製品構成・原価改善の根拠と整合するか", "%", (row) => segmentValues(row, (s) => rate(s.sales - s.cogs, s.sales))),
      make("販管費率", "販管費合計 ÷ 売上高", "売上成長に対して販管費を抑えすぎていないか", "%", (row) => segmentValues(row, (s) => rate(sga(s), s.sales))),
      make("営業利益率", "営業利益 ÷ 売上高", "原価率・販管費率との合計が100%になるか", "%", (row) => segmentValues(row, opMargin)),
      make("EBITDAマージン", "（営業利益＋減価償却費）÷ 売上高", "設備投資後の現金創出力が不自然でないか", "%", (row) => segmentValues(row, (s) => rate(ebitda(s), s.sales))),
      make("その他販管費率", "その他販管費 ÷ 売上高", "経費削減だけで利益を作っていないか", "%", (row) => segmentValues(row, (s) => rate(s.otherSga, s.sales))),
    ] },
    { title: "2. 人件費・賃上げ", rows: [
      make("従業員人件費率", "従業員給与支給総額 ÷ 売上高", "人員計画と売上規模に対して妥当か", "%", (row) => segmentValues(row, (s) => rate(s.employeePay, s.sales))),
      make("役員人件費率", "役員給与支給総額 ÷ 売上高", "役員報酬の変動が利益を歪めていないか", "%", (row) => segmentValues(row, (s) => rate(s.officerPay, s.sales))),
      make("総人件費率", "（従業員＋役員給与）÷ 売上高", "賃上げと利益率が両立しているか", "%", (row) => segmentValues(row, (s) => rate(s.employeePay + s.officerPay, s.sales))),
      make("従業員1人当たり給与支給総額", "従業員給与支給総額 ÷ 常時使用する従業員数（就業時間換算）", "給与支給総額の増加が人数増だけになっていないか", "億円/人", (row) => segmentValues(row, payPerEmployee)),
      make("役員1人当たり給与支給総額（参考）", "役員給与支給総額 ÷ 役員数", "役員数の変化を除いた報酬水準が妥当か", "億円/人", (row) => segmentValues(row, (s) => multiple(s.officerPay, s.officerCount))),
      make("従業員1人当たり給与支給総額の対前年上昇率", "当年の従業員1人当たり給与支給総額 ÷ 前年値－1", "第6次の賃上げ計画と年度推移が整合するか", "%", (row, index) => segments(row).map((entry) => { const key = entry.label === "全社" ? "company" : entry.label === "補助" ? "project" : "other"; return { label: entry.label, value: growth(payPerEmployee(entry.value) ?? 0, previous(index, key) ? payPerEmployee(previous(index, key)!) : undefined) }; })),
      make("労働分配率", "（従業員＋役員給与）÷ 付加価値額", "付加価値の増加が従業員へ還元されているか", "%", (row) => segmentValues(row, (s) => rate(s.employeePay + s.officerPay, valueAdded(s)))),
    ] },
    { title: "3. 生産性", rows: [
      make("従業員1人当たり売上高", "売上高 ÷ 常時使用する従業員数（就業時間換算）", "人員を増やさず売上だけが急増していないか", "億円/人", (row) => segmentValues(row, (s) => perEmployee(s.sales, s))),
      make("1人当たり営業利益", "営業利益 ÷ 常時使用する従業員数（就業時間換算）", "生産性改善が過度になっていないか", "億円/人", (row) => segmentValues(row, (s) => perEmployee(operatingProfit(s), s))),
      make("労働生産性", "付加価値額 ÷（常時使用する従業員数（就業時間換算）＋役員数）", "付加価値・人数・賃上げの関係が整合するか", "億円/人", (row) => segmentValues(row, (s) => multiple(valueAdded(s), s.headcount + s.officerCount))),
      make("従業員数増加率", "当年の常時使用する従業員数（就業時間換算）÷ 前年値－1", "採用可能性と事業拡大ペースが整合するか", "%", (row, index) => segments(row).map((entry) => { const key = entry.label === "全社" ? "company" : entry.label === "補助" ? "project" : "other"; return { label: entry.label, value: growth(entry.value.headcount, previous(index, key)?.headcount) }; })),
      make("売上成長率－従業員増加率", "売上成長率－常時使用する従業員数（就業時間換算）の増加率", "人員増を大きく上回る売上成長に根拠があるか", "pt", (row, index) => segments(row).map((entry) => { const key = entry.label === "全社" ? "company" : entry.label === "補助" ? "project" : "other"; const before = previous(index, key); const sales = growth(entry.value.sales, before?.sales); const people = growth(entry.value.headcount, before?.headcount); return { label: entry.label, value: sales !== undefined && people !== undefined ? sales - people : undefined }; })),
    ] },
    { title: "4. 設備投資", rows: [
      make("減価償却費率", "減価償却費 ÷ 売上高", "投資後の減価償却費が小さすぎないか", "%", (row) => segmentValues(row, (s) => rate(s.depreciation, s.sales))),
      make("設備投資負担率", "当年設備投資額 ÷ 全社売上高", "売上規模に対して投資額が過大でないか", "%", (row) => [{ label: "全社", value: rate(capex.get(row.year) ?? 0, company(row).sales) }]),
      make("設備投資対EBITDA倍率", "当年設備投資額 ÷ 全社EBITDA", "本業の資金創出力で投資を支えられるか", "倍", (row) => [{ label: "全社", value: multiple(capex.get(row.year) ?? 0, ebitda(company(row))) }]),
      make("減価償却カバー率", "EBITDA ÷ 減価償却費", "償却負担に対する利益余力が十分か", "倍", (row) => segmentValues(row, (s) => multiple(ebitda(s), s.depreciation))),
      make("投資後売上増加倍率", "全社売上高の前年差 ÷ 当年設備投資額", "投資効果を過大に見積もっていないか", "倍", (row, index) => [{ label: "全社", value: index ? multiple(company(row).sales - company(plan[index - 1]).sales, capex.get(row.year) ?? 0) : undefined }]),
    ] },
    { title: "5. 補助事業とその他事業の比較", rows: [
      make("補助事業売上構成比", "補助事業売上高 ÷ 全社売上高", "全社が補助事業へ過度に依存していないか", "%", (row) => [{ label: "構成比", value: rate(row.project.sales, company(row).sales) }]),
      make("事業別売上成長率", "当年売上高 ÷ 前年売上高－1", "片方の事業だけが不自然に急成長・縮小していないか", "%", (row, index) => [{ label: "補助", value: growth(row.project.sales, previous(index, "project")?.sales) }, { label: "他", value: growth(row.other.sales, previous(index, "other")?.sales) }]),
      make("売上原価率差", "補助事業原価率－その他事業原価率", "補助事業の採算を過度に良く置いていないか", "pt", (row) => [{ label: "差", value: (rate(row.project.cogs, row.project.sales) ?? 0) - (rate(row.other.cogs, row.other.sales) ?? 0) }]),
      make("営業利益率差", "補助事業営業利益率－その他事業営業利益率", "事業間の利益率差に合理的な根拠があるか", "pt", (row) => [{ label: "差", value: (opMargin(row.project) ?? 0) - (opMargin(row.other) ?? 0) }]),
      make("事業別1人当たり売上高", "事業別売上高 ÷ 事業別の常時使用する従業員数（就業時間換算）", "補助事業の生産性だけが突出していないか", "億円/人", (row) => pairedValues(row, (s) => perEmployee(s.sales, s))),
      make("事業別従業員1人当たり給与支給総額", "事業別従業員給与支給総額 ÷ 事業別の常時使用する従業員数（就業時間換算）", "補助事業と既存事業の待遇差が妥当か", "億円/人", (row) => pairedValues(row, payPerEmployee)),
      make("全社利益増加への補助事業寄与率", "補助事業営業利益の前年差 ÷ 全社営業利益の前年差", "全社利益改善を補助事業だけへ寄せていないか", "%", (row, index) => [{ label: "寄与率", value: index ? rate(operatingProfit(row.project) - operatingProfit(plan[index - 1].project), operatingProfit(company(row)) - operatingProfit(company(plan[index - 1]))) : undefined }]),
    ] },
  ];
}

export function periodLabels(plan: YearPlan[]) {
  return plan.map((row) => `${row.year}\n${YEAR_ROLE_LABELS[row.role]}`);
}
