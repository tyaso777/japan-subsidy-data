import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const addedFields = [
  'project_cost_million_yen_normalized', 'subsidy_million_yen_normalized',
  'self_funding_oku_yen', 'subsidy_rate_pct',
  'sales_baseline_oku_yen', 'sales_target_oku_yen', 'sales_cagr_pct',
  'employees_base_value', 'employees_target_value', 'employees_increase_value',
  'employee_pay_base_value_man_yen_per_person', 'employee_pay_target_value_man_yen_per_person',
  'employee_pay_annual_rate_pct', 'industry', 'investment_component_count', 'project_location_count',
  'analysis_exclusion_reasons',
  ...['project_cost', 'subsidy', 'sales_values', 'sales_rate', 'labor_values', 'labor_rate',
    'employee_pay_values', 'employee_pay_rate', 'officer_pay_values', 'officer_pay_rate',
    'employees_values', 'employees_rate', 'employee_pay_total_increase',
    'investment_sales_ratio', 'value_added_increase_estimated', 'value_added_subsidy_ratio_proxy']
    .map(name => `${name}_analysis_status`),
];

for (const file of ['./build_analysis_dashboard.py', '../html/public_metrics_dashboard.html', '../html/official_metrics_reference.html']) {
const source = readFileSync(new URL(file, import.meta.url), 'utf8');
const exportCode = source.slice(source.indexOf('function csvCell('), source.indexOf("if(document.body.classList.contains('reference-mode'))"));
test(`${file}: every selectable axis and numeric filter has a Japanese header`, () => {
  const metadata = source.slice(source.indexOf('const AXES='), source.indexOf('const COLOR_METRICS='));
  const headers = runInNewContext(metadata + exportCode + ';[...Object.keys(AXES),...NUMERIC_FILTER_FIELDS.map(m=>m.field)].map(key=>[key,csvHeader(key,"ja")])');
  for (const [key, label] of headers) assert.notEqual(label, key);
});
if (file === '../html/public_metrics_dashboard.html') {
  test('Published dashboard contains all added fields in actual case data', () => {
    const data = JSON.parse(source.match(/const DATA=(.*?);const BENCH=/s)[1]);
    assert.ok(data.length > 0);
    for (const row of data) {
      for (const field of addedFields) assert.ok(Object.hasOwn(row, field), `${row.case_id}: ${field}`);
    }
  });
}

for (const axis of ['sales_increase_oku_yen_normalized', 'investment_sales_ratio_pct']) {
  test(`${file}: CSV always includes investment ratio once (axis: ${axis})`, async () => {
    let blob;
    const rows = [
      { ...Object.fromEntries(addedFields.map((field, i) => [field, `value${i}`])), case_id: 'selected', investment_sales_ratio_pct: 25.125 },
      { case_id: 'missing', investment_sales_ratio_pct: null },
    ];
    const context = {
      Blob,
      URL: { createObjectURL(value) { blob = value; return 'blob:test'; }, revokeObjectURL() {} },
      document: { createElement() { return { click() {} }; } },
      numericFilters: [{ field: 'project_cost_million_yen_normalized' }], numericFilterActive: () => true,
      xmetric: { value: axis }, ymetric: { value: 'employee_pay_total_increase_estimated_oku' },
      centralFilterRows: () => rows,
    };
    runInNewContext(exportCode + ';exportCsv();', context);
    const [header, first, second] = (await blob.text()).trimEnd().split('\n');
    const keys = header.split(',');
    for (const field of addedFields) {
      assert.equal(keys.filter(key => key === field).length, 1, field);
      assert.equal(first.split(',')[keys.indexOf(field)], rows[0][field], field);
      assert.equal(second.split(',')[keys.indexOf(field)], '', `${field}: missing stays empty`);
    }
    assert.equal(keys.filter(key => key === 'investment_sales_ratio_pct').length, 1);
    const index = keys.indexOf('investment_sales_ratio_pct');
    assert.equal(first.split(',')[index], '25.125');
    assert.equal(second.split(',')[index], '');
    assert.equal(first.split(',')[0], 'selected');
    const english = await blob.text();
    runInNewContext(exportCode + ";exportCsv('ja');", context);
    const japanese = await blob.text();
    assert.equal(japanese.slice(japanese.indexOf('\n')), english.slice(english.indexOf('\n')), 'only headers change');
    const japaneseKeys = japanese.split('\n')[0].split(',');
    assert.equal(japaneseKeys.length, keys.length);
    assert.equal(new Set(japaneseKeys).size, keys.length);
    assert.ok(japaneseKeys.includes('事業費（百万円）'));
    assert.ok(japaneseKeys.includes('全社売上高に対する投資額割合・近似（%）'));
    assert.ok(japaneseKeys.every(key => !/^[a-z_]+$/.test(key)), 'all exported headers translated');
  });
}
}
