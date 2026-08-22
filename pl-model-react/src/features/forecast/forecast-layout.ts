const MIN_SETTINGS_PERIOD_WIDTH = 220;

export function shouldAutoCollapseSettings(panelWidth: number, periodCount: number) {
  if (panelWidth <= 0 || periodCount <= 0) return false;
  const panelPadding = 20;
  const periodGap = Math.max(0, periodCount - 1) * 8;
  return (panelWidth - panelPadding - periodGap) / periodCount < MIN_SETTINGS_PERIOD_WIDTH;
}

export function settingsPeriodMinWidth(periodCount: number, _variationOpen: boolean) {
  if (periodCount <= 2) return '0px';
  return '150px';
}
