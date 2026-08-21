/// <reference lib="webworker" />

import { createMetricOptimizationExpansionPlan, createMetricOptimizationProposal } from '../domain/optimization';
import type { WorkerRequest, WorkerResponse } from '../features/forecast/optimization-worker-client';

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  try {
    const request = event.data;
    const result = request.kind === 'proposal'
      ? createMetricOptimizationProposal(request.model, request.program, request.baseActuals, request.subsidyActuals, request.actualInputs, request.strategy, { includeExpansionPlan: false }, request.metricTargets)
      : createMetricOptimizationExpansionPlan(request.model, request.initial, request.program, request.baseActuals, request.subsidyActuals, request.actualInputs, request.strategy, request.metricTargets);
    self.postMessage({ ok: true, result } satisfies WorkerResponse);
  } catch (error) {
    self.postMessage({ ok: false, message: error instanceof Error ? error.message : String(error) } satisfies WorkerResponse);
  }
};
