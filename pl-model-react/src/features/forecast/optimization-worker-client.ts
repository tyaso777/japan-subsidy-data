import OptimizationWorker from '../../workers/optimization.worker?worker&inline';
import type { ForecastModel } from '../../domain/forecast-engine';
import type { OptimizationExpansionPlan, OptimizationProposal, OptimizationRangeMode, OptimizationStrategy } from '../../domain/optimization';
import { createMetricOptimizationExpansionPlanAsync, createMetricOptimizationProposal } from '../../domain/optimization';
import type { HistoricalPlInput, ProgramConfiguration } from '../../domain/types';

export type MetricOptimizationInput = {
  model: ForecastModel;
  program: ProgramConfiguration;
  baseActuals: HistoricalPlInput[];
  subsidyActuals: HistoricalPlInput[];
  actualInputs: Record<string, number>;
  metricTargets: Record<string, number>;
  strategy: OptimizationStrategy;
  rangeMode: OptimizationRangeMode;
};

export type WorkerRequest =
  | ({ kind: 'proposal' } & MetricOptimizationInput)
  | ({ kind: 'expansion'; initial: OptimizationProposal } & MetricOptimizationInput);

export type WorkerResponse =
  | { ok: true; result: OptimizationProposal | OptimizationExpansionPlan | undefined }
  | { ok: false; message: string };

function runInWorker<T>(request: WorkerRequest, fallback: () => T): Promise<T> {
  if (typeof globalThis.Worker === 'undefined') {
    return new Promise((resolve) => window.setTimeout(() => resolve(fallback()), 0));
  }

  return new Promise<T>((resolve, reject) => {
    const worker = new OptimizationWorker();
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      worker.terminate();
      if (event.data.ok) resolve(event.data.result as T);
      else reject(new Error(event.data.message));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || '最適化ワーカーでエラーが発生しました。'));
    };
    worker.postMessage(request);
  });
}

export function calculateMetricOptimization(input: MetricOptimizationInput) {
  return runInWorker<OptimizationProposal>(
    { kind: 'proposal', ...input },
    () => createMetricOptimizationProposal(input.model, input.program, input.baseActuals, input.subsidyActuals, input.actualInputs, input.strategy, { includeExpansionPlan: false }, input.metricTargets),
  );
}

export function calculateMetricOptimizationExpansion(input: MetricOptimizationInput, initial: OptimizationProposal) {
  if (typeof globalThis.Worker === 'undefined') {
    return createMetricOptimizationExpansionPlanAsync(input.model, initial, input.program, input.baseActuals, input.subsidyActuals, input.actualInputs, input.strategy, input.metricTargets);
  }
  return runInWorker<OptimizationExpansionPlan | undefined>({ kind: 'expansion', initial, ...input }, () => undefined);
}
