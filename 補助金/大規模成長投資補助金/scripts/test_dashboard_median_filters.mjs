import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

for (const file of ['./build_analysis_dashboard.py', '../html/public_metrics_dashboard.html', '../html/official_metrics_reference.html']) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const code = source.slice(source.indexOf('function benchFor('), source.indexOf('function medianFilterSummaryParts('));
  const rows = [46, 47, 47.5, 48, 49, null].map(value => ({ round: '4次', ratio: value }));
  function evaluate(bucket, benchmarks = [{ round: '4次', current_field: 'ratio', applicant_value: 48, accepted_value: 47 }], candidates = rows) {
    return runInNewContext(code + ';({ matches: medianBaseFiltered.map(d=>matchesMedianPositionFilters(d)), html: medianPositionOptionsHtml("ratio") })', {
      BENCH: benchmarks, medianBaseFiltered: candidates,
      medianPositionFilters: { ratio: bucket }, colorFilterValues: null,
      n: v => v == null || v === '' ? null : Number(v), esc: s => s,
    });
  }
  test(`${file}: reversed medians still match independent thresholds and boundaries`, () => {
    for (const [bucket, expected] of Object.entries({
      below: [true, true, true, false, false, false],
      above: [false, true, true, true, true, false],
      between: [false, false, false, false, false, false],
      applicant_above: [false, false, false, true, true, false],
      accepted_below: [true, false, false, false, false, false],
    })) assert.deepEqual(Array.from(evaluate(bucket).matches), expected, bucket);
    const { html } = evaluate('below');
    for (const label of ['条件なし（6件）', '申請者中央値未満（3件）', '採択者中央値以上（4件）', '申請者中央値以上（2件）', '採択者中央値未満（1件）', '申請者中央値以上～採択者中央値未満（0件）']) assert.ok(html.includes(label), label);
  });
  test(`${file}: mixed rounds use each round's own median`, () => {
    const benchmarks = [
      { round: '4次', current_field: 'ratio', applicant_value: 48, accepted_value: 47 },
      { round: '3次', current_field: 'ratio', applicant_value: 57, accepted_value: 61 },
    ];
    const candidates = [{ round: '4次', ratio: 47.5 }, { round: '3次', ratio: 58 }];
    assert.deepEqual(Array.from(evaluate('below', benchmarks, candidates).matches), [true, false]);
    assert.deepEqual(Array.from(evaluate('between', benchmarks, candidates).matches), [false, true]);
  });
  test(`${file}: one missing median does not prevent comparing the other`, () => {
    const benchmarks = [{ round: '4次', current_field: 'ratio', applicant_value: 48, accepted_value: null }];
    assert.deepEqual(Array.from(evaluate('below', benchmarks).matches), [true, true, true, false, false, false]);
    assert.ok(evaluate('above', benchmarks).matches.every(v => !v));
  });
}
