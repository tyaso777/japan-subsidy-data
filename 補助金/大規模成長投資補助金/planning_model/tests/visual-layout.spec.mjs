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

    const driverPanel = page.locator(".driver-target-table").locator("..");
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
