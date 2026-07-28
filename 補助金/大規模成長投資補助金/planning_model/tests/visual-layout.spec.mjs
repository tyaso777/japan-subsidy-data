import { expect, test } from "@playwright/test";
import { pathToFileURL } from "node:url";
import path from "node:path";

const standaloneUrl = pathToFileURL(
  path.resolve("成長投資計画シミュレーター_大規模成長投資補助金6次公募.html"),
).href;
const viewportWidths = [1280, 1440, 1920];

async function openStandalone(page, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(standaloneUrl, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        transition-duration: 0s !important;
        caret-color: transparent !important;
      }
    `,
  });
}

async function expectNoPageOverflow(page) {
  const overflow = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(
    overflow.documentWidth,
    `document must not overflow the ${overflow.viewportWidth}px viewport`,
  ).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
}

async function expectRowControlsDoNotOverlap(locator) {
  const overlaps = await locator.evaluate((root) => {
    const found = [];
    for (const row of root.querySelectorAll("tr")) {
      const controls = [...row.querySelectorAll("input:not([type='hidden']), button, select")]
        .filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.visibility !== "hidden"
            && style.display !== "none"
            && rect.width > 0
            && rect.height > 0;
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            label: element.getAttribute("aria-label")
              || element.getAttribute("placeholder")
              || element.textContent?.trim()
              || element.tagName,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
          };
        });

      for (let index = 0; index < controls.length; index += 1) {
        for (let otherIndex = index + 1; otherIndex < controls.length; otherIndex += 1) {
          const left = controls[index];
          const right = controls[otherIndex];
          const overlapWidth = Math.min(left.right, right.right) - Math.max(left.left, right.left);
          const overlapHeight = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
          if (overlapWidth > 1 && overlapHeight > 1) {
            found.push({
              row: row.textContent?.trim().slice(0, 80),
              left: left.label,
              right: right.label,
              overlapWidth,
              overlapHeight,
            });
          }
        }
      }
    }
    return found;
  });
  expect(overlaps).toEqual([]);
}

for (const width of viewportWidths) {
  test(`過去データ表の固定表示と横幅を ${width}px で維持する`, async ({ page }) => {
    await openStandalone(page, width);
    await expectNoPageOverflow(page);

    const balanceSheetPanel = page.locator(".balance-sheet-panel");
    await expect(balanceSheetPanel).toBeVisible();
    await balanceSheetPanel.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 180));
    await expectRowControlsDoNotOverlap(balanceSheetPanel);

    await expect(page.locator(".tabs")).toBeInViewport();
    await expect(balanceSheetPanel.locator(".manual-table-heading")).toBeInViewport();
    await expect(page).toHaveScreenshot(`actuals-${width}.png`);
  });

  test(`調整条件表の固定表示と横幅を ${width}px で維持する`, async ({ page }) => {
    await openStandalone(page, width);
    await page.getByRole("button", { name: /②\s*15指標・目標/ }).click();

    const driverPanel = page.locator(".driver-target-table:visible").last().locator("..");
    await expect(driverPanel).toBeVisible();
    await driverPanel.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 260));
    await expectNoPageOverflow(page);
    await expectRowControlsDoNotOverlap(driverPanel);

    await expect(page.locator(".tabs")).toBeInViewport();
    await expect(page.locator(".driver-target-table thead:visible").last()).toBeInViewport();
    await expect(page).toHaveScreenshot(`drivers-${width}.png`);
  });
}

test("diagnostic detail chart labels, legend, and keyboard navigator stay coordinated", async ({ page }) => {
  await openStandalone(page, 1440);
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "データ入出力" }).click();
  await page.getByRole("button", { name: "最適化済み標準提案" }).click();
  await page.locator(".tabs button").nth(4).click();

  const overview = page.locator(".diagnostic-overview-block");
  const detailLayout = page.locator(".diagnostic-detail-layout");
  const pointLabels = page.locator(".diagnostic-detail-layout .trend-chart-point-label");
  const navigator = page.locator(".diagnostic-metric-navigator");
  await expect(overview).toBeVisible();
  await expect(detailLayout).toBeVisible();
  expect(await pointLabels.count()).toBeGreaterThan(0);
  await expect(navigator).toBeVisible();

  const geometry = await page.evaluate(() => {
    const overview = document.querySelector(".diagnostic-overview-block");
    const layout = document.querySelector(".diagnostic-detail-layout")?.getBoundingClientRect();
    const chart = document.querySelector(".diagnostic-detail-layout .trend-chart-card")?.getBoundingClientRect();
    const legend = document.querySelector(".diagnostic-detail-layout .trend-chart-legend")?.getBoundingClientRect();
    const navigator = document.querySelector(".diagnostic-metric-navigator");
    const navigatorBox = navigator?.getBoundingClientRect();
    const groupsPanel = document.querySelector(".diagnostic-groups-panel");
    return overview && layout && chart && legend && navigator && navigatorBox && groupsPanel
      ? {
          chartHeight: chart.height,
          layoutHeight: layout.height,
          legendBottom: legend.bottom,
          chartBottom: chart.bottom,
          layoutBottom: layout.bottom,
          navigatorTop: navigatorBox.top,
          overviewContainsNavigator: overview.contains(navigator),
          overviewContainsGroupsPanel: overview.contains(groupsPanel),
        }
      : null;
  });
  expect(geometry).not.toBeNull();
  expect(Math.abs(geometry.layoutHeight - geometry.chartHeight)).toBeLessThanOrEqual(2);
  expect(geometry.legendBottom).toBeLessThanOrEqual(geometry.chartBottom + 1);
  expect(geometry.navigatorTop).toBeGreaterThanOrEqual(geometry.layoutBottom - 1);
  expect(geometry.overviewContainsNavigator).toBe(true);
  expect(geometry.overviewContainsGroupsPanel).toBe(false);

  const groups = navigator.locator(".diagnostic-metric-group");
  expect(await groups.count()).toBeGreaterThan(1);
  const firstGroupTiles = groups.first().locator(".diagnostic-metric-tile");
  expect(await firstGroupTiles.count()).toBeGreaterThan(1);

  const firstTile = firstGroupTiles.nth(0);
  const secondTile = firstGroupTiles.nth(1);
  await firstTile.focus();
  await expect(firstTile).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowRight");
  await expect(secondTile).toBeFocused();
  await expect(secondTile).toHaveAttribute("aria-pressed", "true");

  const employeeGroupTiles = groups.nth(1).locator(".diagnostic-metric-tile");
  const employeeTileCount = await employeeGroupTiles.count();
  expect(employeeTileCount).toBeGreaterThan(1);
  const employeeFirstTile = employeeGroupTiles.nth(0);
  const expectedDownKey = await employeeFirstTile.evaluate((current) => {
    const currentRect = current.getBoundingClientRect();
    const currentCenter = { x: currentRect.left + currentRect.width / 2, y: currentRect.top + currentRect.height / 2 };
    return Array.from(current.closest(".diagnostic-metric-group")?.querySelectorAll(".diagnostic-metric-tile") ?? [])
      .filter((element) => element !== current)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          key: element.getAttribute("data-metric-key"),
          primary: rect.top + rect.height / 2 - currentCenter.y,
          cross: rect.left + rect.width / 2 - currentCenter.x,
        };
      })
      .filter(({ primary }) => primary > 4)
      .sort((a, b) => a.primary + Math.abs(a.cross) * 3 - (b.primary + Math.abs(b.cross) * 3))[0]?.key ?? null;
  });
  expect(expectedDownKey).toContain("2. 人件費・賃上げ:");
  await employeeFirstTile.focus();
  await page.keyboard.press("ArrowDown");
  const focusedMetric = await page.evaluate(() => {
    const active = document.activeElement;
    return active instanceof HTMLElement
      ? { key: active.dataset.metricKey ?? null, pressed: active.getAttribute("aria-pressed") }
      : null;
  });
  expect(focusedMetric).toEqual({ key: expectedDownKey, pressed: "true" });

  await page.locator(".diagnostic-groups-panel").scrollIntoViewIfNeeded();
  const released = await page.evaluate(() => {
    const chart = document.querySelector(".diagnostic-detail-layout")?.getBoundingClientRect();
    const groupsPanel = document.querySelector(".diagnostic-groups-panel")?.getBoundingClientRect();
    return chart && groupsPanel
      ? {
          chartBottom: chart.bottom,
          groupsTop: groupsPanel.top,
          chartTop: chart.top,
        }
      : null;
  });
  expect(released).not.toBeNull();
  expect(released.chartBottom).toBeLessThanOrEqual(released.groupsTop + 2);
  expect(released.chartTop).toBeLessThan(46);
  await expectNoPageOverflow(page);
});

test("wide diagnostic navigator moves down to the adjacent category before matching x farther away", async ({ page }) => {
  await openStandalone(page, 1920);
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "データ入出力" }).click();
  await page.getByRole("button", { name: "最適化済み標準提案" }).click();
  await page.locator(".tabs button").nth(4).click();

  const groups = page.locator(".diagnostic-metric-navigator .diagnostic-metric-group");
  expect(await groups.count()).toBeGreaterThan(2);
  const employeeTiles = groups.nth(1).locator(".diagnostic-metric-tile");
  expect(await employeeTiles.count()).toBeGreaterThan(1);
  const employeeFirstTile = employeeTiles.nth(0);
  const employeeRowCount = await employeeFirstTile.evaluate((firstTile) => {
    const group = firstTile.closest(".diagnostic-metric-group");
    const tops = Array.from(group?.querySelectorAll(".diagnostic-metric-tile") ?? [])
      .map((element) => Math.round(element.getBoundingClientRect().top));
    return new Set(tops).size;
  });
  expect(employeeRowCount).toBe(1);

  await employeeFirstTile.focus();
  await page.keyboard.press("ArrowDown");
  const focusedKey = await page.evaluate(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement.dataset.metricKey ?? null : null,
  );
  expect(focusedKey).toMatch(/^3\. 生産性:/);
});

test("diagnostic chart stays sticky at tablet width and releases only at phone width", async ({ page }) => {
  await openStandalone(page, 900);
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "データ入出力" }).click();
  await page.getByRole("button", { name: "最適化済み標準提案" }).click();
  await page.locator(".tabs button").nth(4).click();

  const detailLayout = page.locator(".diagnostic-detail-layout");
  await expect(detailLayout).toBeVisible();
  expect(await detailLayout.evaluate((element) => getComputedStyle(element).position)).toBe("sticky");

  await page.setViewportSize({ width: 700, height: 900 });
  expect(await detailLayout.evaluate((element) => getComputedStyle(element).position)).toBe("static");
});
