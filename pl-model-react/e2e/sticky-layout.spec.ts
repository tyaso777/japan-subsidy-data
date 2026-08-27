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

  const settingsBody = page.getByTestId('forecast-settings-body');
  const periodHeaders = page.getByTestId('forecast-period-header');
  await settingsBody.evaluate((element) => { element.scrollTop = Math.max(1, element.scrollHeight - element.clientHeight); });
  const settingsBodyGeometry = await geometry(settingsBody);
  for (const periodHeader of await periodHeaders.all()) {
    const periodHeaderGeometry = await geometry(periodHeader);
    expectOpaque(periodHeaderGeometry);
    expect(periodHeaderGeometry.position).toBe('sticky');
    expect(periodHeaderGeometry.top).toBeGreaterThanOrEqual(settingsBodyGeometry.top);
    expect(periodHeaderGeometry.top - settingsBodyGeometry.top).toBeLessThanOrEqual(1.5);
  }

  await page.getByRole('tab', { name: 'PL表' }).click();
  await expect(page.getByTestId('forecast-logic-detail')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /04ロジックマップで確認/ })).toBeVisible();
});

test('中央を最下部までスクロールしても水準設定の期間見出しがパネル見出しへ重ならない', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('app-toolbar').getByRole('button', { name: '03 将来予測・PL' }).click();

  const panel = page.getByTestId('forecast-settings-panel');
  const panelHeader = page.getByTestId('forecast-settings-header');
  const panelBody = page.getByTestId('forecast-settings-body');
  const periodHeaders = page.getByTestId('forecast-period-header');

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await panelBody.evaluate((element) => { element.scrollTop = element.scrollHeight; });

  const panelGeometry = await geometry(panel);
  const headerGeometry = await geometry(panelHeader);
  const bodyGeometry = await geometry(panelBody);
  expect(panelGeometry.position).toBe('sticky');
  expect(headerGeometry.position).toBe('relative');
  expectOpaque(headerGeometry);
  expect(bodyGeometry.top).toBeGreaterThanOrEqual(headerGeometry.bottom - 1.5);
  for (const periodHeader of await periodHeaders.all()) {
    const periodGeometry = await geometry(periodHeader);
    expect(periodGeometry.top).toBeGreaterThanOrEqual(headerGeometry.bottom - 1.5);
    expect(periodGeometry.top).toBeGreaterThanOrEqual(bodyGeometry.top - 1.5);
  }
});

test('次へで画面を切り替えるとページ先頭へ戻る', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  await page.getByRole('button', { name: '次へ：03 将来予測・PL' }).click();

  await expect(page.getByTestId('forecast-heading')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test('水準設定には通常操作だけを表示し、行別の詳細変動設定を表示しない', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('app-toolbar').getByRole('button', { name: '将来予測・PL' }).click();

  await expect(page.getByLabel('補助事業期間 売上高 開始時固定値')).toBeVisible();
  await expect(page.getByLabel('補助事業期間 売上高 開始時増減')).toBeVisible();
  await expect(page.getByRole('button', { name: '補助事業期間 売上高 詳細な変動設定' })).toHaveCount(0);
  await expect(page.getByLabel('補助事業期間 売上高 毎年固定増減')).toHaveCount(0);
});

test('期間・過去実績の財務表はワイド画面でも会計表の密度を保つ', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');

  const balanceSheet = page.getByTestId('historical-bs');
  const input = page.getByLabel('全社 B/S 2023年 資産総額');
  const tableWidth = await balanceSheet.evaluate((element) => element.getBoundingClientRect().width);
  const headerOverflow = await balanceSheet.locator('header').evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  const inputBox = await input.boundingBox();
  const rowBox = await input.locator('xpath=ancestor::tr').boundingBox();

  expect(tableWidth).toBeLessThanOrEqual(606);
  expect(headerOverflow.scrollWidth).toBeLessThanOrEqual(headerOverflow.clientWidth);
  expect(inputBox?.width).toBeLessThanOrEqual(74);
  expect(inputBox?.height).toBeLessThanOrEqual(22);
  expect(rowBox?.height).toBeLessThanOrEqual(28);
});

test('狭い画面でも事業比較の長いタイトルがカード外へはみ出さない', async ({ page }) => {
  await page.setViewportSize({ width: 980, height: 900 });
  await page.goto('/');
  await page.getByTestId('app-toolbar').getByRole('button', { name: '03 将来予測・PL' }).click();

  const chart = page.getByRole('img', { name: '事業比較 従業員数（就業時間換算） 推移チャート' });
  const card = chart.locator('xpath=ancestor::article');
  const overflow = await card.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
});

test('制度定義カードの見出しは枠端に密着せず、狭い画面でも操作が収まる', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto('/');
  await page.getByTestId('app-toolbar').getByRole('button', { name: '01 制度定義' }).click();

  const card = page.getByTestId('definition-section-periods');
  const header = page.getByTestId('definition-section-header-periods');
  const title = header.getByRole('heading', { name: '区間名の定義' });
  const cardBox = await card.boundingBox();
  const titleBox = await title.boundingBox();
  const overflow = await card.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));

  expect((titleBox?.x ?? 0) - (cardBox?.x ?? 0)).toBeGreaterThanOrEqual(15);
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  await expect(header.getByRole('button', { name: '区間を追加' })).toBeVisible();
});

test('狭い画面でも共通数値定義のPL挿入設定が重ならずカード内へ収まる', async ({ page }) => {
  await page.setViewportSize({ width: 1101, height: 900 });
  await page.goto('/');
  await page.getByTestId('app-toolbar').getByRole('button', { name: '01 制度定義' }).click();

  const card = page.getByTestId('numeric-definition-付加価値額');
  const insertion = page.getByLabel('付加価値額 挿入位置');
  const order = page.getByLabel('付加価値額 同位置での順番');
  const overflow = await card.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  const insertionBox = await insertion.boundingBox();
  const orderBox = await order.boundingBox();

  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  expect((insertionBox?.x ?? 0) + (insertionBox?.width ?? 0)).toBeLessThanOrEqual(orderBox?.x ?? 0);
});

test('水準設定は固定項目を一括で隠して変動可能項目へ集中できる', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('app-toolbar').getByRole('button', { name: '03 将来予測・PL' }).click();

  const panel = page.getByTestId('forecast-settings-panel');
  await expect(panel.getByLabel('補助事業期間 原価率 年間変化')).toBeVisible();
  await panel.getByRole('button', { name: '固定項目を隠す' }).click();
  await expect(panel.getByLabel('補助事業期間 原価率 年間変化')).toHaveCount(0);
  await expect(panel.getByLabel('補助事業期間 売上高 年間変化')).toBeVisible();
  await expect(panel.getByRole('button', { name: '固定項目を表示' })).toBeVisible();
});

test('全社合算は編集タブから外しPL表の閲覧対象として残す', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('app-toolbar').getByRole('button', { name: '03 将来予測・PL' }).click();

  const editScopes = page.getByLabel('編集対象事業');
  await expect(editScopes.getByRole('button', { name: '全社合算' })).toHaveCount(0);
  await expect(editScopes.getByRole('button', { name: 'ベース事業' })).toBeVisible();
  await expect(editScopes.getByRole('button', { name: '補助事業' })).toBeVisible();

  await page.getByRole('tab', { name: 'PL表' }).click();
  const tableScopes = page.getByLabel('P/L表示対象');
  await tableScopes.getByRole('button', { name: '全社合算' }).click();
  await expect(page.getByRole('heading', { name: '全社合算 P/L' })).toBeVisible();
  await expect(page.getByLabel('補助事業期間 売上高 年間変化')).toBeEnabled();
});

test('PL表ヘッダーの事業切替と表示ボタンが重ならない', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('app-toolbar').getByRole('button', { name: '03 将来予測・PL' }).click();
  await page.getByRole('tab', { name: 'PL表' }).click();
  await page.getByTestId('forecast-pl-table').evaluate((element) => { (element as HTMLElement).style.width = '900px'; });

  const scopes = page.getByLabel('P/L表示対象');
  const controls = page.getByTestId('forecast-pl-table-header-controls');
  const supplementary = page.getByTestId('forecast-pl-table').getByRole('button', { name: '補足指標を隠す' });
  await expect(controls).toHaveCSS('flex-wrap', 'wrap');
  await expect(scopes).toHaveCSS('flex-shrink', '0');
  const scopeBox = await scopes.getByRole('button', { name: '補助事業' }).boundingBox();
  const supplementaryBox = await supplementary.boundingBox();
  expect(scopeBox).not.toBeNull();
  expect(supplementaryBox).not.toBeNull();
  expect(supplementaryBox!.x - (scopeBox!.x + scopeBox!.width)).toBeGreaterThanOrEqual(8);
});

test('03画面で水準範囲の未適正化を確認してその場で適正化できる', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '案件JSONメニュー' }).click();
  await page.getByRole('menuitem', { name: 'サンプルデータを読み込み（補助事業実績あり）' }).click();
  await page.getByTestId('app-toolbar').getByRole('button', { name: '03 将来予測・PL' }).click();

  const settings = page.getByTestId('forecast-settings-panel');
  await expect(settings.getByRole('alert')).toContainText('水準範囲は未適正化です');
  await page.getByRole('button', { name: '過去実績から水準範囲を適正化' }).click();
  await expect(settings.getByText('過去実績に適正化済み')).toBeVisible();
});

test('補助事業実績なしのサンプルは新規事業として適正化し初期値入力を案内する', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '案件JSONメニュー' }).click();
  await page.getByRole('menuitem', { name: 'サンプルデータを読み込み（補助事業実績なし）' }).click();
  await page.getByTestId('app-toolbar').getByRole('button', { name: '03 将来予測・PL' }).click();
  await page.getByRole('button', { name: '過去実績から水準範囲を適正化' }).click();

  const settings = page.getByTestId('forecast-settings-panel');
  await expect(settings.getByRole('alert')).toContainText('補助事業を新規事業として設定しました');
  await expect(settings.getByRole('alert')).toContainText('売上高・従業員数・役員数の開始値');
});
