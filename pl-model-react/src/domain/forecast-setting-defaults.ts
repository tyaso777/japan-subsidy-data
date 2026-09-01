export type ForecastSettingRange = { min: number; max: number };

const fixedSupplementaryRanges: Record<string, ForecastSettingRange> = {
  cogsRate: { min: -1, max: 0 },
  cogsDepRate: { min: 0, max: 1 },
  sgaDepRate: { min: 0, max: 1 },
  researchDevelopmentRate: { min: 0, max: 0 },
  otherSgaRate: { min: -1, max: 0 },
  employeeSalaryShare: { min: 0, max: 0 },
  officerCompensationShare: { min: 0, max: 0 },
  nonOperatingRate: { min: 0, max: 0 },
  extraordinaryRate: { min: 0, max: 0 },
  taxRate: { min: 0, max: 0 },
};

export function fixedSupplementaryRange(driver: string): ForecastSettingRange | null {
  const range = fixedSupplementaryRanges[driver];
  return range ? { ...range } : null;
}
