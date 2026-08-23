import { expect, test, type Locator } from '@playwright/test';

type StickyGeometry = {
  top: number;
  bottom: number;
  backgroundColor: string;
  position: string;
  zIndex: string;
};

async function geometry(locator: Locator): Promise<StickyGeometry> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      backgroundColor: style.backgroundColor,
      position: style.position,
      zIndex: style.zIndex,
    };
  });
}

function expectOpaque({ backgroundColor }: StickyGeometry) {
  expect(backgroundColor).not.toBe('transparent');
  expect(backgroundColor).not.toMatch(/^rgba\([^)]*,\s*0\)$/);
}

function expectJoined(upper: StickyGeometry, lower: StickyGeometry) {
  expect(Math.abs(upper.bottom - lower.top)).toBeLessThanOrEqual(1.5);
}

test('sticky layers remain opaque, ordered and joined while scrolling', async ({ page }) => {
  await page.goto('/');

  const toolbar = page.getByTestId('app-toolbar');
  const actualsHeader = page.getByTestId('historical-bs-sticky-header');
  await actualsHeader.evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY + 300));

  const toolbarGeometry = await geometry(toolbar);
  const actualsGeometry = await geometry(actualsHeader);
  expectOpaque(toolbarGeometry);
  expectOpaque(actualsGeometry);
  expect(toolbarGeometry.zIndex).toBe('50');
  expect(actualsGeometry.zIndex).toBe('40');
  expectJoined(toolbarGeometry, actualsGeometry);

  await toolbar.getByRole('button', { name: '将来予測・PL' }).click();
  await page.getByTestId('forecast-comparison-sticky-header').evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 180));

  const operation = await geometry(page.getByTestId('forecast-operation-sticky-layer'));
  const displayControls = await geometry(page.getByTestId('forecast-chart-display-controls'));
  const comparison = await geometry(page.getByTestId('forecast-comparison-sticky-header'));
  const settings = await geometry(page.getByTestId('forecast-settings-panel'));
  const metrics = await geometry(page.getByTestId('forecast-metrics-panel'));

  [operation, displayControls, comparison, settings, metrics].forEach(expectOpaque);
  expect(operation.zIndex).toBe('40');
  expect(displayControls.zIndex).toBe('30');
  expect(comparison.zIndex).toBe('20');
  expect(settings.zIndex).toBe('10');
  expect(metrics.zIndex).toBe('10');
  expectJoined(await geometry(toolbar), operation);
  expectJoined(operation, displayControls);
  expectJoined(displayControls, comparison);
  expectJoined(operation, settings);
  expectJoined(operation, metrics);

  await page.getByRole('tab', { name: 'PL表' }).click();
  await expect(page.getByTestId('forecast-logic-detail')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /04ロジックマップで確認/ })).toBeVisible();
});
