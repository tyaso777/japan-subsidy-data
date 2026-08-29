// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { applyOptimizationExpansionPlan, applyOptimizationStrength, buildOptimizationTimelines, createConstrainedOptimizationProposal, createMetricOptimizationExpansionPlan, createMetricOptimizationProposal, createOptimizationExpansionPlan, createOptimizationProposal, createOptimizationTimelineEvaluator, inferOptimizationStrength } from '../src/domain/optimization';
import { projectForecastSeries, type ForecastModel } from '../src/domain/forecast-engine';
import { baseHistoricalPl, subsidyHistoricalPl } from '../src/domain/sample-data';
import { createModelStore } from '../src/store/model-store';

const model = (): ForecastModel => ({
  segments: [{ id: 'A', definitionId: 'plan', startYear: 2026, endYear: 2028 }],
  series: [{ id: 'base-sales', label: '売上高', scope: 'base', valueKind: 'money', projectionMode: 'compound', baseYear: 2025, baseValue: 100, periods: [{ id: 'A', startYear: 2026, endYear: 2028, annualGrowthRate: 5, startAdjustment: 0 }] }],
});

describe('目標最適化提案', () => {
  it('変更された事業のPLだけを再計算し、全件再計算と同じ結果を返す', () => {
    const state = createModelStore().getState();
    const evaluator = createOptimizationTimelineEvaluator(state.actuals.basePl, state.actuals.subsidyPl);
    const initial = evaluator.evaluate(state.forecast);
    expect(initial).toEqual(buildOptimizationTimelines(state.forecast, state.actuals.basePl, state.actuals.subsidyPl));

    const changed = structuredClone(state.forecast);
    changed.series.find((series) => series.id === 'base-sales')!.periods[0].annualGrowthRate += 1;
    const incrementallyEvaluated = evaluator.evaluate(changed);

    expect(incrementallyEvaluated).toEqual(buildOptimizationTimelines(changed, state.actuals.basePl, state.actuals.subsidyPl));
    expect(evaluator.stats()).toEqual({ baseBuilds: 2, subsidyBuilds: 1 });
  });

  it('探索中に同じ水準ベクトルを重複評価しない', () => {
    const constrained = model();
    constrained.series[0].periods[0] = { ...constrained.series[0].periods[0], annualGrowthRate: 0, range: { min: 0, max: 1 } };
    const evaluatedVectors: string[] = [];
    const evaluate = (candidate: ForecastModel) => {
      const vector = candidate.series.flatMap((series) => series.periods.map((period) => period.annualGrowthRate)).join(',');
      evaluatedVectors.push(vector);
      return [{ id: 'growth', label: '成長率', value: candidate.series[0].periods[0].annualGrowthRate, target: 10, direction: 'min' as const, unit: '%' }];
    };

    createConstrainedOptimizationProposal(constrained, evaluate, { iterations: 20, includeExpansionPlan: false });

    expect(evaluatedVectors).toEqual([...new Set(evaluatedVectors)]);
  });

  it('達成可能な目標をハード制約として満たした後で変更量を最小化する', () => {
    const constrained = model();
    constrained.series[0].periods[0] = { ...constrained.series[0].periods[0], startYear: 2026, endYear: 2026, annualGrowthRate: 0, range: { min: 0, max: 20 } };
    const evaluate = (candidate: ForecastModel) => [{ id: 'growth', label: '成長率', value: candidate.series[0].periods[0].annualGrowthRate, target: 10, direction: 'min' as const, unit: '%' }];

    const proposal = createConstrainedOptimizationProposal(constrained, evaluate, { strategy: 'minimum-change', iterations: 40 });

    expect(proposal.feasibility).toBe('feasible');
    expect(proposal.metricDiagnostics[0]).toMatchObject({ id: 'growth', status: 'met', target: 10, gap: 0 });
    expect(proposal.optimized.series[0].periods[0].annualGrowthRate).toBeGreaterThanOrEqual(10);
    expect(proposal.optimized.series[0].periods[0].annualGrowthRate).toBeLessThan(10.02);
  });

  it('固定系列は水準内・水準外のどちらでも最適化変数に含めない', () => {
    const constrained = model();
    constrained.series[0].changePolicy = 'fixed';
    constrained.series[0].periods[0] = { ...constrained.series[0].periods[0], annualGrowthRate: 0, range: { min: 0, max: 0 } };
    const evaluate = (candidate: ForecastModel) => [{ id: 'growth', label: '成長率', value: candidate.series[0].periods[0].annualGrowthRate, target: 10, direction: 'min' as const, unit: '%' }];

    const proposal = createConstrainedOptimizationProposal(constrained, evaluate, { includeExpansionPlan: false });
    const expansion = createOptimizationExpansionPlan(constrained, proposal, evaluate);

    expect(proposal.feasibility).toBe('infeasible');
    expect(proposal.optimized.series[0].periods[0].annualGrowthRate).toBe(0);
    expect(proposal.changes).toHaveLength(0);
    expect(expansion).toBeUndefined();
  });

  it('MinとMaxが同値の調整系列は水準内・水準外のどちらでもロックする', () => {
    const constrained = model();
    constrained.series[0].periods[0] = { ...constrained.series[0].periods[0], annualGrowthRate: 0, range: { min: 0, max: 0 } };
    const evaluate = (candidate: ForecastModel) => [{ id: 'growth', label: '成長率', value: candidate.series[0].periods[0].annualGrowthRate, target: 10, direction: 'min' as const, unit: '%' }];

    const proposal = createConstrainedOptimizationProposal(constrained, evaluate, { includeExpansionPlan: false });
    const expansion = createOptimizationExpansionPlan(constrained, proposal, evaluate);

    expect(proposal.feasibility).toBe('infeasible');
    expect(proposal.optimized.series[0].periods[0].annualGrowthRate).toBe(0);
    expect(proposal.changes).toHaveLength(0);
    expect(expansion).toBeUndefined();
  });

  it('達成不能時は未達指標・境界到達・必要な境界拡張の概算を返す', () => {
    const constrained = model();
    constrained.series[0].periods[0] = { ...constrained.series[0].periods[0], startYear: 2026, endYear: 2026, annualGrowthRate: 0, range: { min: 0, max: 20 } };
    const evaluate = (candidate: ForecastModel) => [{ id: 'growth', label: '成長率', value: candidate.series[0].periods[0].annualGrowthRate, target: 30, direction: 'min' as const, unit: '%' }];

    const proposal = createConstrainedOptimizationProposal(constrained, evaluate, { strategy: 'minimum-change', iterations: 40 });

    expect(proposal.feasibility).toBe('infeasible');
    expect(proposal.metricDiagnostics[0]).toMatchObject({ id: 'growth', status: 'unmet', value: 20, target: 30, gap: 10 });
    expect(proposal.boundDiagnostics).toHaveLength(1);
    expect(proposal.boundDiagnostics[0]).toMatchObject({ seriesId: 'base-sales', boundary: 'max', limit: 20, value: 20 });
    expect(proposal.boundDiagnostics[0].estimates[0]).toMatchObject({ metricId: 'growth', requiredExpansion: 10, proposedLimit: 30 });
  });

  it('感応度を再評価しながら複数境界へ配分した推奨拡張セットを返す', () => {
    const constrained: ForecastModel = {
      segments: [{ id: 'A', definitionId: 'plan', startYear: 2026, endYear: 2026 }],
      series: ['first', 'second'].map((id) => ({
        id: `base-${id}`, label: id, scope: 'base' as const, valueKind: 'money' as const,
        projectionMode: 'compound' as const, baseYear: 2025, baseValue: 100,
        periods: [{ id: 'A', startYear: 2026, endYear: 2026, annualGrowthRate: 0, startAdjustment: 0, range: { min: 0, max: 10 } }],
      })),
    };
    const evaluate = (candidate: ForecastModel) => {
      const [first, second] = candidate.series.map((series) => series.periods[0].annualGrowthRate);
      return [{ id: 'growth', label: '成長率', value: Math.sqrt(Math.max(0, first)) + Math.sqrt(Math.max(0, second)), target: 8, direction: 'min' as const, unit: '%' }];
    };

    const proposal = createConstrainedOptimizationProposal(constrained, evaluate, { strategy: 'balanced', iterations: 24, expansionIterations: 10 });

    expect(proposal.expansionPlan?.status).toBe('feasible');
    expect(proposal.expansionPlan?.entries).toHaveLength(2);
    expect(proposal.expansionPlan?.entries.every((entry) => entry.after > entry.before && entry.after <= 30)).toBe(true);
    expect(proposal.expansionPlan?.metricDiagnostics[0].status).toBe('met');
    const applied = applyOptimizationExpansionPlan(proposal);
    expect(applied.series.every((series) => series.periods[0].range!.max > 10)).toBe(true);
    expect(applied.series.every((series) => series.periods[0].annualGrowthRate === 0)).toBe(true);
    expect(evaluate(applied)[0].value).toBe(0);
    const reapplied = createConstrainedOptimizationProposal(applied, evaluate, { strategy: 'balanced', iterations: 24, includeExpansionPlan: false });
    expect(reapplied.feasibility).toBe('feasible');
    expect(reapplied.changes.length).toBeGreaterThan(0);
    expect(constrained.series.every((series) => series.periods[0].range!.max === 10)).toBe(true);
  });

  it('既定の水準外探索は現在値を再基準化せず、達成可能なら探索窓を広げて続ける', () => {
    const constrained = model();
    constrained.series[0].periods[0] = { ...constrained.series[0].periods[0], annualGrowthRate: 0, range: { min: 0, max: 20 } };
    const evaluate = (candidate: ForecastModel) => [{ id: 'growth', label: '成長率', value: candidate.series[0].periods[0].annualGrowthRate, target: 58, direction: 'min' as const, unit: '%' }];

    const proposal = createConstrainedOptimizationProposal(constrained, evaluate, { iterations: 40 });

    expect(proposal.expansionPlan?.status).toBe('feasible');
    expect(proposal.expansionPlan?.metricDiagnostics[0]).toMatchObject({ status: 'met', gap: 0 });
  });

  it('水準外探索は根拠のない共通上限で打ち切らず、通常Maxを大きく超える達成解も探索する', () => {
    const constrained = model();
    constrained.series[0].periods[0] = { ...constrained.series[0].periods[0], startYear: 2026, endYear: 2026, annualGrowthRate: 0, range: { min: 0, max: 20 } };
    const evaluate = (candidate: ForecastModel) => [{ id: 'growth', label: '成長率', value: candidate.series[0].periods[0].annualGrowthRate, target: 300, direction: 'min' as const, unit: '%' }];
    const initial = createConstrainedOptimizationProposal(constrained, evaluate, { iterations: 40, includeExpansionPlan: false });

    const expansion = createOptimizationExpansionPlan(constrained, initial, evaluate, { strategy: 'minimum-change', iterations: 80 });

    expect(expansion?.status).toBe('feasible');
    expect(expansion?.expandedModel.series[0].periods[0].annualGrowthRate).toBeGreaterThanOrEqual(300);
    expect(expansion?.entries[0].after).toBeGreaterThan(200);
  });

  it('水準外探索でも複利成長率はマイナス100%を下回らない', () => {
    const constrained = model();
    constrained.series[0].periods[0] = { ...constrained.series[0].periods[0], startYear: 2026, endYear: 2026, annualGrowthRate: 0, range: { min: -20, max: 20 } };
    const evaluate = (candidate: ForecastModel) => [{ id: 'decline', label: '減少率', value: candidate.series[0].periods[0].annualGrowthRate, target: -120, direction: 'max' as const, unit: '%' }];
    const initial = createConstrainedOptimizationProposal(constrained, evaluate, { iterations: 40, includeExpansionPlan: false });

    const expansion = createOptimizationExpansionPlan(constrained, initial, evaluate, { strategy: 'minimum-change', iterations: 80 });

    expect(expansion?.status).toBe('best-effort');
    expect(expansion?.expandedModel.series[0].periods[0].annualGrowthRate).toBeGreaterThan(-100);
  });

  it('通常範囲の判定と拡張セット探索を二段階で実行できる', () => {
    const constrained = model();
    constrained.series[0].periods[0] = { ...constrained.series[0].periods[0], annualGrowthRate: 0, range: { min: 0, max: 20 } };
    const evaluate = (candidate: ForecastModel) => [{ id: 'growth', label: '成長率', value: candidate.series[0].periods[0].annualGrowthRate, target: 30, direction: 'min' as const, unit: '%' }];

    const initial = createConstrainedOptimizationProposal(constrained, evaluate, { iterations: 20, includeExpansionPlan: false });
    expect(initial.feasibility).toBe('infeasible');
    expect(initial.expansionPlan).toBeUndefined();

    const expansionPlan = createOptimizationExpansionPlan(constrained, initial, evaluate, { iterations: 20, expansionIterations: 8 });
    expect(expansionPlan?.status).toBe('feasible');
    expect(expansionPlan?.entries[0]).toMatchObject({ boundary: 'max', before: 20 });
  });

  it('通常水準を大きく超えてもドメイン上可能なら達成解を返す', () => {
    const constrained = model();
    constrained.series[0].periods[0] = { ...constrained.series[0].periods[0], annualGrowthRate: 0, range: { min: 0, max: 20 } };
    const evaluate = (candidate: ForecastModel) => [{ id: 'growth', label: '成長率', value: candidate.series[0].periods[0].annualGrowthRate, target: 1000, direction: 'min' as const, unit: '%' }];

    const proposal = createConstrainedOptimizationProposal(constrained, evaluate, { iterations: 20, expansionIterations: 8 });

    expect(proposal.expansionPlan?.status).toBe('feasible');
    expect(proposal.expansionPlan?.entries).toHaveLength(1);
    expect(proposal.expansionPlan!.entries[0].after).toBeGreaterThanOrEqual(1000);
  });

  it('計算不能な指標を固定点数へ変換せず評価不能として返す', () => {
    const constrained = model();
    const proposal = createConstrainedOptimizationProposal(constrained, () => [{ id: 'invalid', label: '計算不能指標', target: 10, direction: 'min', unit: '%' }], { iterations: 4 });

    expect(proposal.feasibility).toBe('unavailable');
    expect(proposal.metricDiagnostics).toEqual([expect.objectContaining({ id: 'invalid', status: 'unavailable', value: undefined })]);
    expect(proposal.afterScore).toBeUndefined();
  });

  it('最小変更は同等な水準へ変更を分散し、優先順位は先頭水準から変更する', () => {
    const symmetric: ForecastModel = {
      segments: [{ id: 'A', definitionId: 'plan', startYear: 2026, endYear: 2026 }],
      series: ['first', 'second'].map((id) => ({
        id: `base-${id}`, label: id, scope: 'base' as const, valueKind: 'money' as const,
        projectionMode: 'compound' as const, baseYear: 2025, baseValue: 100,
        periods: [{ id: 'A', startYear: 2026, endYear: 2026, annualGrowthRate: 0, startAdjustment: 0, range: { min: 0, max: 20 } }],
      })),
    };
    const objective = (candidate: ForecastModel) => {
      const total = candidate.series.reduce((sum, series) => sum + series.periods[0].annualGrowthRate, 0);
      return 10_000 * (Math.max(0, 20 - total) / 20) ** 2;
    };

    const minimumChange = createOptimizationProposal(symmetric, objective, { strategy: 'minimum-change', iterations: 24, initialStep: 2 });
    const priority = createOptimizationProposal(symmetric, objective, { strategy: 'priority', iterations: 24, initialStep: 2 });
    const minimumRates = minimumChange.optimized.series.map((series) => series.periods[0].annualGrowthRate);
    const priorityRates = priority.optimized.series.map((series) => series.periods[0].annualGrowthRate);

    expect(minimumChange.strategy).toBe('minimum-change');
    expect(Math.abs(minimumRates[0] - minimumRates[1])).toBeLessThanOrEqual(2);
    expect(priority.strategy).toBe('priority');
    expect(priorityRates[0]).toBeGreaterThan(priorityRates[1] + 10);
  });

  it('バランス型は効率だけで一項目へ寄せず、最大の変更割合を抑える', () => {
    const twoDrivers: ForecastModel = {
      segments: [{ id: 'A', definitionId: 'plan', startYear: 2026, endYear: 2026 }],
      series: ['effective', 'supporting'].map((id) => ({
        id: `base-${id}`, label: id, scope: 'base' as const, valueKind: 'money' as const,
        projectionMode: 'compound' as const, baseYear: 2025, baseValue: 100,
        periods: [{ id: 'A', startYear: 2026, endYear: 2026, annualGrowthRate: 0, startAdjustment: 0, range: { min: 0, max: 20 } }],
      })),
    };
    const objective = (candidate: ForecastModel) => {
      const [effective, supporting] = candidate.series.map((series) => series.periods[0].annualGrowthRate);
      return 10_000 * (Math.max(0, 20 - (effective * 2 + supporting)) / 20) ** 2;
    };

    const minimumChange = createOptimizationProposal(twoDrivers, objective, { strategy: 'minimum-change', iterations: 40, initialStep: 2 });
    const balanced = createOptimizationProposal(twoDrivers, objective, { strategy: 'balanced', iterations: 40, initialStep: 2 });
    const minimumRates = minimumChange.optimized.series.map((series) => series.periods[0].annualGrowthRate);
    const balancedRates = balanced.optimized.series.map((series) => series.periods[0].annualGrowthRate);

    expect(balanced.strategy).toBe('balanced');
    expect(Math.abs(balancedRates[0] - balancedRates[1])).toBeLessThan(Math.abs(minimumRates[0] - minimumRates[1]));
    expect(Math.max(...balancedRates)).toBeLessThanOrEqual(Math.max(...minimumRates));
  });

  it('バランス型はMinの小変更で補助事業期間の水準が別の局所解へ飛ばない', () => {
    const state = createModelStore().getState();
    const optimize = (min: number) => {
      const forecast = structuredClone(state.forecast);
      const sales = forecast.series.find((series) => series.id === 'base-sales')!;
      sales.periods.find((period) => period.id === 'subsidy')!.range = { min, max: 50 };
      return createMetricOptimizationProposal(forecast, state.program, state.actuals.basePl, state.actuals.subsidyPl, state.actuals.metricInputs, 'balanced');
    };

    const wider = optimize(-10);
    const narrower = optimize(-9);
    const rate = (proposal: typeof wider) => proposal.optimized.series.find((series) => series.id === 'base-sales')!.periods.find((period) => period.id === 'subsidy')!.annualGrowthRate;

    const widerRate = rate(wider);
    const narrowerRate = rate(narrower);
    expect(wider.feasibility).toBe('feasible');
    expect(narrower.feasibility).toBe('feasible');
    expect(Math.abs(widerRate - narrowerRate), `Min=-10: ${widerRate}, Min=-9: ${narrowerRate}`).toBeLessThan(2);
  }, 30_000);

  it('個社目標がある指標は制度目標ではなく実効目標を制約に使う', () => {
    const state = createModelStore().getState();
    const proposal = createMetricOptimizationProposal(
      state.forecast,
      state.program,
      state.actuals.basePl,
      state.actuals.subsidyPl,
      state.actuals.metricInputs,
      'minimum-change',
      { iterations: 1, includeExpansionPlan: false },
      { 'company-sales-growth': 42 },
    );
    expect(proposal.metricDiagnostics.find((metric) => metric.id === 'company-sales-growth')?.target).toBe(42);
  });

  it('明示的に狭い給与上限で未達となる案件も、拡張範囲から目標達成案を作れる', () => {
    const store = createModelStore();
    store.getState().optimizeForecastRangesFromActuals();
    const state = store.getState();
    const constrained = structuredClone(state.forecast);
    constrained.series.filter((series) => series.id.endsWith('-payPerPerson')).forEach((series) => {
      series.periods.forEach((period) => { period.range = { min: period.range!.min, max: period.annualGrowthRate }; });
    });
    const initial = createMetricOptimizationProposal(constrained, state.program, state.actuals.basePl, state.actuals.subsidyPl, state.actuals.metricInputs, 'minimum-change', { includeExpansionPlan: false });
    expect(initial.feasibility).toBe('infeasible');

    const expansion = createMetricOptimizationExpansionPlan(constrained, initial, state.program, state.actuals.basePl, state.actuals.subsidyPl, state.actuals.metricInputs, 'minimum-change');
    expect(expansion?.status).toBe('feasible');
    const rangesOnly = applyOptimizationExpansionPlan({ ...initial, expansionPlan: expansion });
    expect(rangesOnly.series.map((series) => series.periods.map((period) => period.annualGrowthRate))).toEqual(
      constrained.series.map((series) => series.periods.map((period) => period.annualGrowthRate)),
    );

    const final = createMetricOptimizationProposal(rangesOnly, state.program, state.actuals.basePl, state.actuals.subsidyPl, state.actuals.metricInputs, 'minimum-change', { includeExpansionPlan: false });
    expect(final.feasibility).toBe('feasible');
    expect(final.changes.length).toBeGreaterThan(0);
  }, 60_000);

  it('最少項目型は定義順によらず改善効率の高い水準を選び、変更項目数を抑える', () => {
    const twoDrivers: ForecastModel = {
      segments: [{ id: 'A', definitionId: 'plan', startYear: 2026, endYear: 2026 }],
      series: ['ordinary', 'effective'].map((id) => ({
        id: `base-${id}`, label: id, scope: 'base' as const, valueKind: 'money' as const,
        projectionMode: 'compound' as const, baseYear: 2025, baseValue: 100,
        periods: [{ id: 'A', startYear: 2026, endYear: 2026, annualGrowthRate: 0, startAdjustment: 0, range: { min: 0, max: 20 } }],
      })),
    };
    const objective = (candidate: ForecastModel) => {
      const [ordinary, effective] = candidate.series.map((series) => series.periods[0].annualGrowthRate);
      return 10_000 * (Math.max(0, 20 - (ordinary + effective * 2)) / 20) ** 2;
    };

    const sparse = createOptimizationProposal(twoDrivers, objective, { strategy: 'sparse', iterations: 40, initialStep: 2 });

    expect(sparse.strategy).toBe('sparse');
    expect(sparse.changes).toHaveLength(1);
    expect(sparse.changes[0].seriesId).toBe('base-effective');
  });

  it('提案作成時は元モデルを変えず、目標との不足を改善する方向と勢いを記録する', () => {
    const original = model();
    const before = structuredClone(original);
    const objective = (candidate: ForecastModel) => Math.abs(projectForecastSeries(candidate.series[0]).at(-1)!.value - 200);
    const proposal = createOptimizationProposal(original, objective, { iterations: 24, initialStep: 4 });
    expect(original).toEqual(before);
    expect(proposal.afterScore!).toBeLessThan(proposal.beforeScore!);
    expect(proposal.changes[0]).toMatchObject({ seriesId: 'base-sales', periodId: 'A', field: 'annualGrowthRate', direction: 'up' });
    expect(proposal.changes[0].momentum).toBeGreaterThan(0);
  });

  it('適用強度0・50・100%を提案前後の水準間で補間する', () => {
    const original = model();
    const objective = (candidate: ForecastModel) => Math.abs(projectForecastSeries(candidate.series[0]).at(-1)!.value - 200);
    const proposal = createOptimizationProposal(original, objective);
    const baseRate = original.series[0].periods[0].annualGrowthRate;
    const targetRate = proposal.optimized.series[0].periods[0].annualGrowthRate;
    expect(applyOptimizationStrength(proposal, 0).series[0].periods[0].annualGrowthRate).toBe(baseRate);
    expect(applyOptimizationStrength(proposal, 50).series[0].periods[0].annualGrowthRate).toBeCloseTo((baseRate + targetRate) / 2);
    expect(applyOptimizationStrength(proposal, 100)).toEqual(proposal.optimized);
    expect(inferOptimizationStrength(proposal, applyOptimizationStrength(proposal, 0))).toBe(0);
    expect(inferOptimizationStrength(proposal, applyOptimizationStrength(proposal, 50))).toBe(50);
    expect(inferOptimizationStrength(proposal, applyOptimizationStrength(proposal, 100))).toBe(100);
  });

  it('配分率は現在PLを変えず、最適化結果と適用率に応じて段階反映する', () => {
    const original: ForecastModel = {
      segments: [{ id: 'A', definitionId: 'plan', startYear: 2026, endYear: 2028 }],
      finalYearSalesAllocation: { finalYear: 2028, baseSharePercent: 60 },
      series: [
        { id: 'base-sales', label: '売上高', scope: 'base', valueKind: 'money', projectionMode: 'compound', baseYear: 2025, baseValue: 500, periods: [{ id: 'A', startYear: 2026, endYear: 2028, annualGrowthRate: 5, startAdjustment: 0, range: { min: -10, max: 50 } }] },
        { id: 'subsidy-sales', label: '売上高', scope: 'subsidy', valueKind: 'money', projectionMode: 'compound', baseYear: 2025, baseValue: 100, periods: [{ id: 'A', startYear: 2026, endYear: 2028, annualGrowthRate: 5, startAdjustment: 0, range: { min: -10, max: 50 } }] },
      ],
    };
    const proposal = createConstrainedOptimizationProposal(original, (candidate) => [{
      id: 'total-sales', label: '全社売上高',
      value: candidate.series.reduce((sum, series) => sum + projectForecastSeries(series).at(-1)!.value, 0),
      target: 800, direction: 'min', unit: '百万円',
    }], { iterations: 60, initialStep: 4, includeExpansionPlan: false });
    const totals: number[] = [];
    const shares: number[] = [];

    for (const strength of [0, 50, 100]) {
      const timelines = buildOptimizationTimelines(applyOptimizationStrength(proposal, strength), baseHistoricalPl, subsidyHistoricalPl);
      const baseSales = timelines.base.records.at(-1)!.sales;
      const subsidySales = timelines.subsidy.records.at(-1)!.sales;
      totals.push(baseSales + subsidySales);
      shares.push(baseSales / (baseSales + subsidySales) * 100);
    }
    expect(shares[0]).toBeCloseTo(500 / 600 * 100, 8);
    expect(shares[1]).toBeLessThan(shares[0]);
    expect(shares[1]).toBeGreaterThan(60);
    expect(shares[2]).toBeCloseTo(60, 1);
    expect(totals[2]).toBeGreaterThan(totals[0]);
  });

  it('目標達成度が同じなら最適化開始時からの変更量が小さい案を選ぶ', () => {
    const original = model();
    original.series[0].periods[0] = {
      ...original.series[0].periods[0],
      startYear: 2026,
      endYear: 2026,
      range: { min: 0, max: 100 },
    };
    const target = 110;
    const objective = (candidate: ForecastModel) => {
      const value = projectForecastSeries(candidate.series[0]).at(-1)!.value;
      const deficit = Math.max(0, target - value) / target;
      return 10_000 * deficit ** 2;
    };

    const proposal = createOptimizationProposal(original, objective, { iterations: 40, initialStep: 4 });
    const optimizedRate = proposal.optimized.series[0].periods[0].annualGrowthRate;
    expect(optimizedRate).toBeGreaterThanOrEqual(9.99);
    expect(optimizedRate).toBeLessThan(10.1);
  });
});
