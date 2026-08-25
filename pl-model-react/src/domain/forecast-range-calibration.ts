import type { HistoricalPlInput, ProgramConfiguration } from './types';

export type ForecastRangeCalibration = {
  sourceFingerprint: string;
};

export type ForecastRangeCalibrationStatus = 'missing' | 'current' | 'stale';

type CalibrationSource = {
  program: ProgramConfiguration;
  actuals: { basePl: HistoricalPlInput[]; subsidyPl: HistoricalPlInput[] };
  caseSettings: { forecastRangeCalibration?: ForecastRangeCalibration };
};

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function forecastRangeCalibrationFingerprint(source: Pick<CalibrationSource, 'program' | 'actuals'>): string {
  const relevantSource = {
    basePl: source.actuals.basePl,
    subsidyPl: source.actuals.subsidyPl,
    periodPhases: source.program.definitions.periods.map(({ id, modelPhase }) => ({ id, modelPhase })),
  };
  return `v1-${fnv1a(JSON.stringify(relevantSource))}`;
}

export function forecastRangeCalibrationStatus(source: CalibrationSource): ForecastRangeCalibrationStatus {
  const stored = source.caseSettings.forecastRangeCalibration?.sourceFingerprint;
  if (!stored) return 'missing';
  return stored === forecastRangeCalibrationFingerprint(source) ? 'current' : 'stale';
}
