const clean = (value) => String(value ?? "").replace(/\r/g, "").trim();
const number = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(String(value).replace(/[,，]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

export function parsePeriodLabel(label) {
  const raw = clean(label);
  let match;
  if ((match = raw.match(/((?:19|20)\d{2})[年\/](\d{1,2})月?期/))) {
    return { period_label: match[0], normalized_year: Number(match[1]), normalized_month: Number(match[2]), period_type: "four_digit_fiscal_period", year_status: "確定" };
  }
  if ((match = raw.match(/(?<!\d)(\d{2})\/(\d{1,2})期/))) {
    const yy = Number(match[1]);
    return { period_label: match[0], normalized_year: 2000 + yy, normalized_month: Number(match[2]), period_type: "two_digit_fiscal_period", year_status: "2000年代と仮定" };
  }
  if ((match = raw.match(/((?:19|20)\d{2})年度/))) {
    return { period_label: match[0], normalized_year: Number(match[1]), normalized_month: null, period_type: "fiscal_year", year_status: "確定" };
  }
  if ((match = raw.match(/((?:19|20)\d{2})年/))) {
    return { period_label: match[0], normalized_year: Number(match[1]), normalized_month: null, period_type: "calendar_or_unspecified_year", year_status: "年のみ・年度区分不明" };
  }
  if ((match = raw.match(/(?<!\d)[’']?(\d{2})年/))) {
    return { period_label: match[0], normalized_year: 2000 + Number(match[1]), normalized_month: null, period_type: "two_digit_year", year_status: "2000年代と仮定" };
  }
  return { period_label: raw, normalized_year: null, normalized_month: null, period_type: raw ? "unparsed" : "missing", year_status: raw ? "要確認" : "記載なし" };
}

const periodPattern = "(?:20\\d{2}[年/]\\d{1,2}月?期|\\d{2}/\\d{1,2}期|20\\d{2}年度|20\\d{2}年)";
const amountPattern = "([0-9０-９][0-9０-９,，]*(?:\\.[0-9０-９]+)?)\\s*億円";
const toAscii = (text) => text.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/成⾧/g, "成長");

function periodAmountPairs(text) {
  const normalized = toAscii(text);
  const re = new RegExp(`(${periodPattern})[^\\n]{0,24}?${amountPattern}`, "g");
  return [...normalized.matchAll(re)]
    .filter((match) => !/増加額/.test(match[0]))
    .map((match) => ({ period: parsePeriodLabel(match[1]), value: number(match[2]), raw: match[0] }));
}

function rateMetrics(text) {
  const normalized = toAscii(text);
  const increase = normalized.match(/(?:売上高)?増加額[^0-9+＋-]{0,12}[+＋]?\s*([0-9,.]+)\s*億円/i)
    ?? normalized.match(/[+＋]\s*([0-9,.]+)\s*億円/);
  const cagr = normalized.match(/CAGR\s*[+＋]?\s*([0-9.]+)\s*[％%]/i);
  const growth = normalized.match(/(?:売上高)?成長率[^0-9]{0,12}([0-9.]+)\s*[％%]/)
    ?? normalized.match(/[+＋]\s*([0-9.]+)\s*[％%]/)
    ?? normalized.match(/([0-9.]+)\s*[％%]\s*UP/i);
  return {
    increase_oku: number(increase?.[1]),
    growth_rate_pct: number(growth?.[1]),
    cagr_pct: number(cagr?.[1]),
    rate_type: cagr ? "CAGR" : growth ? "累積成長率または原文記載率" : "",
  };
}

function inferPeriods(text) {
  const labels = [...toAscii(text).matchAll(new RegExp(periodPattern, "g"))].map((m) => parsePeriodLabel(m[0]));
  const dated = labels.filter((p) => p.normalized_year !== null);
  if (!dated.length) return { baseline: parsePeriodLabel(""), target: parsePeriodLabel("") };
  const baseline = dated.reduce((best, p) => p.normalized_year < best.normalized_year ? p : best, dated[0]);
  const target = dated.reduce((best, p) => p.normalized_year > best.normalized_year ? p : best, dated[0]);
  return { baseline, target };
}

function makeSeries(row, index, label, fragment, values = {}, method = "section_parser") {
  const pairs = periodAmountPairs(fragment);
  const periods = inferPeriods(fragment);
  const metrics = rateMetrics(fragment);
  const singleTargetWithIncrease = pairs.length === 1 && metrics.increase_oku !== null;
  const baselinePair = singleTargetWithIncrease ? null : pairs[0];
  const targetPair = pairs.length > 1 ? pairs.at(-1) : singleTargetWithIncrease ? pairs[0] : null;
  const baseline = values.baseline_period ?? baselinePair?.period ?? periods.baseline;
  const target = values.target_period ?? targetPair?.period ?? periods.target;
  let baselineSales = values.baseline_sales_oku ?? baselinePair?.value ?? null;
  let targetSales = values.target_sales_oku ?? targetPair?.value ?? null;
  const increase = values.increase_oku ?? metrics.increase_oku;
  if (baselineSales === null && targetSales !== null && increase !== null) baselineSales = targetSales - increase;
  if (targetSales === null && baselineSales !== null && increase !== null) targetSales = baselineSales + increase;
  const arithmetic = baselineSales !== null && targetSales !== null && increase !== null
    ? Math.abs((targetSales - baselineSales) - increase) <= Math.max(0.2, Math.abs(increase) * 0.01)
    : null;
  const yearNeedsReview = [baseline, target].some((p) => p.year_status === "要確認" || p.year_status === "2000年代と仮定");
  return {
    case_id: row.case_id, round: row.round, company: row.company,
    series_id: `${row.case_id}_sales_${String(index + 1).padStart(2, "0")}`,
    series_label: label || "代表系列", scope: label || "", is_primary: index === 0,
    baseline_period_label: baseline.period_label, baseline_year: baseline.normalized_year, baseline_month: baseline.normalized_month,
    baseline_period_type: baseline.period_type, baseline_year_status: baseline.year_status,
    baseline_sales_oku: baselineSales,
    target_period_label: target.period_label, target_year: target.normalized_year, target_month: target.normalized_month,
    target_period_type: target.period_type, target_year_status: target.year_status,
    target_sales_oku: targetSales, increase_oku: increase,
    growth_rate_pct: values.growth_rate_pct ?? metrics.growth_rate_pct,
    cagr_pct: values.cagr_pct ?? metrics.cagr_pct,
    rate_type: values.rate_type ?? metrics.rate_type,
    extraction_method: method,
    confidence: values.confidence ?? (yearNeedsReview ? "medium" : "high"),
    review_required: values.review_required ?? (yearNeedsReview || arithmetic === false),
    arithmetic_status: arithmetic === null ? "未判定" : arithmetic ? "整合" : "不整合",
    page: row.page, raw_fragment: clean(fragment), pdf_url: row.pdf_url,
    _points: values.points ?? pairs.map((pair) => ({ ...pair.period, sales_oku: pair.value, raw: pair.raw })),
  };
}

function tableScopeSeries(row, text) {
  const scopes = ["単体", "連結"];
  const result = [];
  for (const scope of scopes) {
    const re = new RegExp(`(${periodPattern})[^\\n]*?${scope}売上高\\s*${amountPattern}`, "g");
    const pairs = [...toAscii(text).matchAll(re)].map((m) => ({ period: parsePeriodLabel(m[1]), value: number(m[2]) }));
    if (pairs.length < 2) continue;
    const increaseMatch = toAscii(text).match(new RegExp(`${scope}\\s*([0-9,.]+)億円増`));
    const increase = number(increaseMatch?.[1]);
    const targetPair = increase === null ? pairs.at(-1) : (pairs.find((pair) => Math.abs((pair.value - pairs[0].value) - increase) < 0.2) ?? pairs.at(-1));
    result.push(makeSeries(row, result.length, scope, text, {
      baseline_period: pairs[0].period, baseline_sales_oku: pairs[0].value,
      target_period: targetPair.period, target_sales_oku: targetPair.value,
      increase_oku: increase, confidence: "high", review_required: false,
      points: pairs.map((pair) => ({ ...pair.period, sales_oku: pair.value, raw: `${scope}売上高` })),
    }, "parallel_scope_table"));
  }
  return result;
}

function componentSeries(row, text) {
  const normalized = toAscii(text);
  const targetMatch = normalized.match(/(20\d{2}年(?:度)?)(?:時点|まで|に)/);
  const baseMatch = normalized.match(/対\s*([^）)\n]+)/);
  const targetPeriod = parsePeriodLabel(targetMatch?.[1] ?? "");
  const baselinePeriod = parsePeriodLabel(baseMatch?.[1] ?? "");
  const result = [];
  const totalMatch = normalized.match(/(?:^|\n)売上\s*([0-9,.]+)億円/m);
  const componentMatches = [...normalized.matchAll(/(?:うち)?\s*(既存事業|補助事業)\s*([0-9,.]+)億円\s*[（(][+＋]?([0-9,.]+)億円\s*[/／]\s*[+＋]?([0-9,.]+)[％%][）)]/g)];
  if (totalMatch && componentMatches.length >= 2) {
    const target = number(totalMatch[1]);
    const increase = componentMatches.reduce((sum, match) => sum + (number(match[3]) ?? 0), 0);
    result.push(makeSeries(row, result.length, "会社全体", totalMatch[0], {
      baseline_period: baselinePeriod, baseline_sales_oku: target !== null ? target - increase : null,
      target_period: targetPeriod, target_sales_oku: target, increase_oku: increase,
      confidence: "high", review_required: false,
    }, "component_total_parser"));
  }
  for (const match of normalized.matchAll(/(?:うち)?\s*(既存事業|補助事業|会社全体)\s*([0-9,.]+)億円\s*[（(][+＋]?([0-9,.]+)億円\s*[/／]\s*[+＋]?([0-9,.]+)[％%][）)]/g)) {
    const target = number(match[2]), increase = number(match[3]);
    result.push(makeSeries(row, result.length, match[1], match[0], {
      baseline_period: baselinePeriod, baseline_sales_oku: target !== null && increase !== null ? target - increase : null,
      target_period: targetPeriod, target_sales_oku: target, increase_oku: increase,
      growth_rate_pct: number(match[4]), confidence: "high", review_required: false,
    }, "component_line_parser"));
  }
  return result;
}

function inlineEntitySeries(row, text) {
  const normalized = toAscii(text);
  if (!/補助事業/.test(normalized) || !/会社全体|全体売上/.test(normalized)) return [];
  const lines = normalized.split(/\n|。/);
  const periods = inferPeriods(normalized);
  const baselinePeriod = periods.baseline.normalized_year !== periods.target.normalized_year || /(?:基準|対比|比較|比）|比\))/.test(normalized)
    ? periods.baseline : parsePeriodLabel("");
  const definitions = [
    ["会社全体", (line) => /会社全体|全体売上/.test(line) && !/補助事業/.test(line)],
    ["補助事業", (line) => /補助事業/.test(line)],
  ];
  return definitions.map(([label, predicate], index) => {
    const fragment = lines.filter(predicate).join("\n");
    const oku = fragment.match(/(?:売上目標|売上高)(?!増加額)[^0-9]{0,8}([0-9,.]+)\s*億円/);
    const yen = fragment.match(/(?:売上目標|売上高)(?!増加額)[^0-9]{0,8}([0-9,]+)\s*円/);
    const targetSales = oku ? number(oku[1]) : yen ? number(yen[1]) / 100_000_000 : null;
    const metrics = rateMetrics(fragment);
    return makeSeries(row, index, label, fragment, {
      baseline_period: baselinePeriod, target_period: periods.target,
      target_sales_oku: targetSales, increase_oku: metrics.increase_oku,
      growth_rate_pct: metrics.growth_rate_pct, rate_type: metrics.rate_type,
      confidence: "medium", review_required: true,
    }, "inline_entity_metric_parser");
  });
}

function arrowSeries(row, text) {
  const re = new RegExp(`(${periodPattern})\\s*${amountPattern}[^\\n→➡]*[→➡]\\s*(${periodPattern})\\s*${amountPattern}`);
  const match = toAscii(text).match(re);
  if (!match) return [];
  const baseline = parsePeriodLabel(match[1]), target = parsePeriodLabel(match[3]);
  const baselineSales = number(match[2]), targetSales = number(match[4]);
  return [makeSeries(row, 0, "代表系列", match[0], {
    baseline_period: baseline, baseline_sales_oku: baselineSales,
    target_period: target, target_sales_oku: targetSales,
    increase_oku: baselineSales !== null && targetSales !== null ? targetSales - baselineSales : null,
    confidence: "high", review_required: baseline.year_status !== "確定" || target.year_status !== "確定",
    points: [
      { ...baseline, sales_oku: baselineSales, raw: match[0] },
      { ...target, sales_oku: targetSales, raw: match[0] },
    ],
  }, "arrow_period_amount_parser")];
}

function labeledBlocks(row, text) {
  const normalized = toAscii(text);
  const re = /【([^】]+)】|売上成長目標[（(]([^）)]+)[）)]|^[•・]?\s*(当社グループ連結|当社|会社全体|補助事業|単体|連結)\s*(?=[:：\n]|売上高)|[（(](グループ全社連結|東京連結|コンソーシアム合算|山福単体)[）)]|^[•・]\s*([^（\n]{2,20})（(?=20\d{2}年?→)/gm;
  const matches = [...normalized.matchAll(re)].map((m) => ({ index: m.index, label: m[1] || m[2] || m[3] || m[4] || m[5] }));
  if (matches.length < 2) return [];
  const baseContext = normalized.match(new RegExp(`(${periodPattern})[^\\n]{0,20}(?:比|対比|比較)`))
    ?? normalized.match(new RegExp(`基準年[^\\n]{0,20}?(${periodPattern})`));
  return matches.map((match, i) => {
    const fragment = normalized.slice(match.index, matches[i + 1]?.index ?? normalized.length);
    const item = makeSeries(row, i, match.label, fragment);
    if (baseContext) {
      const base = parsePeriodLabel(baseContext[1]);
      item.baseline_period_label = base.period_label; item.baseline_year = base.normalized_year; item.baseline_month = base.normalized_month;
      item.baseline_period_type = base.period_type; item.baseline_year_status = base.year_status;
    }
    const targetContexts = [...fragment.matchAll(new RegExp(`(${periodPattern})(?=[^\\n]{0,8}(?:まで|に|時点))`, "g"))]
      .map((candidate) => parsePeriodLabel(candidate[1]));
    if (targetContexts.length) {
      const target = targetContexts.reduce((best, candidate) => {
        const bestKey = (best.normalized_year ?? -1) * 100 + (best.normalized_month ?? 0);
        const candidateKey = (candidate.normalized_year ?? -1) * 100 + (candidate.normalized_month ?? 0);
        return candidateKey > bestKey ? candidate : best;
      }, targetContexts[0]);
      item.target_period_label = target.period_label; item.target_year = target.normalized_year; item.target_month = target.normalized_month;
      item.target_period_type = target.period_type; item.target_year_status = target.year_status;
    }
    return item;
  });
}

function pairedScopeMetrics(row, text) {
  const normalized = toAscii(text);
  if (!/(単体|単独)/.test(normalized) || !/連結/.test(normalized)) return [];
  const periods = inferPeriods(normalized);
  const result = [];
  for (const labels of [["単体", "単体|単独"], ["連結", "連結"]]) {
    const [label, token] = labels;
    const rate = normalized.match(new RegExp(`(?:${token})[^\\n%]{0,35}?([0-9,.]+)\\s*[%％]`))
      ?? normalized.match(new RegExp(`成長率[^\\n]{0,25}?(?:${token})[^0-9]{0,8}([0-9,.]+)\\s*[%％]`));
    const increase = normalized.match(new RegExp(`(?:${token})[^\\n億]{0,35}?([0-9,.]+)\\s*億円`))
      ?? normalized.match(new RegExp(`増加額[^\\n]{0,25}?(?:${token})[^0-9]{0,8}([0-9,.]+)\\s*億円`));
    if (!rate && !increase) continue;
    result.push(makeSeries(row, result.length, label, normalized, {
      baseline_period: periods.baseline, target_period: periods.target,
      increase_oku: number(increase?.[1]), growth_rate_pct: number(rate?.[1]),
      confidence: "medium", review_required: true,
    }, "paired_scope_metric_parser"));
  }
  return result.length === 2 ? result : [];
}

function headedSections(row, text) {
  const lines = clean(text).split("\n");
  const heading = /^(?:【([^】]+)】(?:（[^）]+）)?|((?:会社全体|補助事業|当社グループ(?:連結)?|グループ全社(?:連結)?|単体|連結)))\s*$/;
  const starts = [];
  lines.forEach((line, i) => { const m = line.trim().match(heading); if (m) starts.push({ i, label: m[1] || m[2] }); });
  if (starts.length < 2) return [];
  return starts.map((start, i) => {
    const end = starts[i + 1]?.i ?? lines.length;
    const prefix = start.i > 0 ? `${lines[0]}\n` : "";
    return makeSeries(row, i, start.label, prefix + lines.slice(start.i, end).join("\n"));
  });
}

function fallbackSeries(row) {
  const periods = [...toAscii(clean(row.raw)).matchAll(new RegExp(periodPattern, "g"))].map((m) => parsePeriodLabel(m[0]));
  const baseline = periods.find((p) => p.normalized_year === number(row.baseline_year)) ?? periods[0] ?? parsePeriodLabel(row.baseline_year ? `${row.baseline_year}年` : "");
  const target = [...periods].reverse().find((p) => p.normalized_year === number(row.target_year)) ?? periods.at(-1) ?? parsePeriodLabel(row.target_year ? `${row.target_year}年` : "");
  return makeSeries(row, 0, "代表系列", row.raw, {
    baseline_period: baseline, baseline_sales_oku: number(row.baseline_sales_oku),
    target_period: target, target_sales_oku: number(row.target_sales_oku), increase_oku: number(row.increase_oku),
    growth_rate_pct: number(row.stated_cumulative_growth_pct) ?? (String(row.stated_rate_type).includes("CAGR") ? null : number(row.stated_rate_pct)),
    cagr_pct: number(row.reported_cagr_pct) ?? (String(row.stated_rate_type).includes("CAGR") ? number(row.stated_rate_pct) : number(row.calculated_cagr_pct)),
    rate_type: row.stated_rate_type ?? "", confidence: row.confidence ?? "medium",
    review_required: /不整合|抽出不全|要確認/.test(row.validation_status ?? ""),
  }, "representative_fallback");
}

export function deriveSalesSeries(rows) {
  const all = [];
  for (const row of rows) {
    const text = clean(row.raw);
    let series = tableScopeSeries(row, text);
    if (series.length < 2) series = componentSeries(row, text);
    if (series.length < 2) series = inlineEntitySeries(row, text);
    if (series.length < 2) series = labeledBlocks(row, text);
    if (series.length < 2) series = headedSections(row, text);
    if (series.length < 2) series = pairedScopeMetrics(row, text);
    if (series.length < 2) series = arrowSeries(row, text);
    if (series.length < 1) series = [fallbackSeries(row)];
    series.forEach((item, i) => { item.series_id = `${row.case_id}_sales_${String(i + 1).padStart(2, "0")}`; item.is_primary = i === 0; });
    all.push(...series);
  }
  return all;
}

export function validateSalesSeries(rows) {
  const issues = [];
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.series_id)) issues.push(`${row.series_id}: duplicate id`);
    seen.add(row.series_id);
    for (const side of ["baseline", "target"]) {
      const month = row[`${side}_month`];
      if (month !== null && (month < 1 || month > 12)) issues.push(`${row.series_id}: invalid ${side} month`);
      if (row[`${side}_period_type`] === "two_digit_fiscal_period" && row[`${side}_year_status`] !== "2000年代と仮定") issues.push(`${row.series_id}: unsafe two-digit normalization`);
    }
  }
  return issues;
}
