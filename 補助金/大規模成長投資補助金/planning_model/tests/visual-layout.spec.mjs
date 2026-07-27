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

test("diagnostic detail chart, value table, and keyboard navigator stay coordinated", async ({ page }) => {
  await openStandalone(page, 1440);
  await page.locator(".tabs button").nth(4).click();

  const detailLayout = page.locator(".diagnostic-detail-layout");
  const valuePanel = page.locator(".diagnostic-values-panel");
  const navigator = page.locator(".diagnostic-metric-navigator");
  await expect(detailLayout).toBeVisible();
  await expect(valuePanel).toBeVisible();
  await expect(navigator).toBeVisible();

  const geometry = await page.evaluate(() => {
    const layout = document.querySelector(".diagnostic-detail-layout")?.getBoundingClientRect();
    const chart = document.querySelector(".diagnostic-detail-layout .trend-chart-card")?.getBoundingClientRect();
    const values = document.querySelector(".diagnostic-values-panel")?.getBoundingClientRect();
    const navigatorBox = document.querySelector(".diagnostic-metric-navigator")?.getBoundingClientRect();
    return layout && chart && values && navigatorBox
      ? {
          chartRight: chart.right,
          valuesLeft: values.left,
          layoutBottom: layout.bottom,
          navigatorTop: navigatorBox.top,
        }
      : null;
  });
  expect(geometry).not.toBeNull();
  expect(geometry.valuesLeft).toBeGreaterThanOrEqual(geometry.chartRight - 1);
  expect(geometry.navigatorTop).toBeGreaterThanOrEqual(geometry.layoutBottom - 1);

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

  await page.keyboard.press("ArrowDown");
  const nextGroupTile = groups.nth(1).locator(".diagnostic-metric-tile").nth(1);
  await expect(nextGroupTile).toBeFocused();
  await expect(nextGroupTile).toHaveAttribute("aria-pressed", "true");
  await expectNoPageOverflow(page);
});
