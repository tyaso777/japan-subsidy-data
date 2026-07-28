import { expect, test } from "@playwright/test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { readFile } from "node:fs/promises";
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

function futureMappingWorkbook() {
  return zipSync({
    "[Content_Types].xml": strToU8("keep-content-types"),
    "xl/workbook.xml": strToU8(`<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="将来計画" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`),
    "xl/worksheets/sheet1.xml": strToU8(`<?xml version="1.0"?><worksheet><sheetData><row r="2"><c r="B2"><v>1200</v></c></row><row r="3"><c r="B3"><v>3500</v></c></row><row r="4"><c r="B4"><v>1500</v></c></row></sheetData></worksheet>`),
  });
}

test("Excelマッピングで③の将来設備投資とPL固定値を取り込む", async ({ page }) => {
  await openStandalone(page, 1440);
  await page.getByRole("button", { name: "データ入出力" }).click();
  await page.getByRole("button", { name: "最適化済み標準提案" }).click();

  const mapping = {
    format: "growth-investment-excel-mapping/v1",
    name: "将来取込UIテスト",
    bindings: [
      { id: "capex", target: "futureCapex.baseYear.1-24", excel: { sheet: "将来計画", cell: "B2", unit: "百万円" }, direction: "import" },
      { id: "company-sales", target: "companyPL.baseYear.2-1", excel: { sheet: "将来計画", cell: "B3", unit: "百万円" }, direction: "import" },
      { id: "project-sales", target: "projectPL.baseYear.7-1", excel: { sheet: "将来計画", cell: "B4", unit: "百万円" }, direction: "import" },
    ],
  };
  await page.locator('input[accept*=".json"]').setInputFiles({
    name: "future-mapping.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(mapping)),
  });
  await page.locator('input[accept=".xlsx,.xlsm"]').setInputFiles({
    name: "future-plan.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(futureMappingWorkbook()),
  });
  await expect(page.getByRole("button", { name: "①過去データのみ" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "取込内容を確認" }).click();
  await expect(page.locator(".excel-mapping-status")).toContainText("取込候補 0件");
  await expect(page.locator(".excel-mapping-status")).toContainText("選択範囲外 3件");
  await page.getByRole("button", { name: "①過去＋③将来データ" }).click();
  await page.getByRole("button", { name: "ベース事業＋補助事業" }).click();
  await page.getByRole("button", { name: "取込内容を確認" }).click();
  await expect(page.locator(".excel-mapping-status")).toContainText("取込候補 3件");
  await page.getByRole("button", { name: "確認した値を反映" }).click();
  await expect(page.locator(".excel-mapping-status")).toContainText("3件を反映");

  await page.getByRole("button", { name: "③ 将来データ入力" }).click();
  await expect(page.getByRole("button", { name: "ベース事業PLを入力" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".future-capex-table input").nth(2)).toHaveValue("1,200,000");
  await expect(page.getByLabel("2028年 売上高（手入力固定値）")).toHaveCount(1);
  await expect(page.getByLabel("2028年 売上高（手入力固定値）")).toHaveValue("1,500,000");
  await expect(page.getByLabel("2028年 売上高（空欄は自動予測）")).toHaveAttribute("placeholder", "2,000,000");
});

test("マッピング出力は手入力の有無にかかわらず現在の全社・補助・ベース予測値を書き出す", async ({ page }) => {
  await openStandalone(page, 1440);
  await page.getByRole("button", { name: "データ入出力" }).click();
  await page.getByRole("button", { name: "最適化済み標準提案" }).click();

  const mapping = {
    format: "growth-investment-excel-mapping/v1",
    name: "実効予測値出力UIテスト",
    bindings: [
      { id: "company-sales", target: "companyPL.baseYear.2-1", excel: { sheet: "将来計画", cell: "B2", unit: "円" }, direction: "export" },
      { id: "project-sales", target: "projectPL.baseYear.7-1", excel: { sheet: "将来計画", cell: "B3", unit: "円" }, direction: "export" },
      { id: "base-sales", target: "basePL.baseYear.M2-1", excel: { sheet: "将来計画", cell: "B4", unit: "円" }, direction: "export" },
    ],
  };
  await page.locator('input[accept*=".json"]').setInputFiles({
    name: "effective-export-mapping.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(mapping)),
  });
  await page.locator('input[accept=".xlsx,.xlsm"]').setInputFiles({
    name: "effective-plan.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(futureMappingWorkbook()),
  });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "別Excelとして出力" }).click();
  const download = await downloadPromise;
  const downloadedBytes = new Uint8Array(await readFile(await download.path()));
  const files = unzipSync(downloadedBytes);
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
  const values = ["B2", "B3", "B4"].map((cell) => {
    const match = sheet.match(new RegExp(`<c[^>]*r="${cell}"[^>]*>.*?<v>([^<]+)</v>`, "s"));
    return Number(match?.[1]);
  });

  expect(values.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
  expect(values[0]).toBeCloseTo(values[1] + values[2], 2);
});

test("第6次公式A002サンプルを①と③へ取り込み将来の全社・補助・ベースPLを埋められる", async ({ page }) => {
  await openStandalone(page, 1440);
  await page.getByRole("button", { name: "データ入出力" }).click();

  const excelDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "第6次公式A002サンプル" }).click();
  const excelDownload = await excelDownloadPromise;
  expect(excelDownload.suggestedFilename()).toBe("任意Excel変換サンプル_第6次公式A002.xlsx");

  const mappingDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "公式対応JSON" }).click();
  const mappingDownload = await mappingDownloadPromise;
  expect(mappingDownload.suggestedFilename()).toBe("任意Excel変換サンプル_第6次公式A002_マッピング.json");

  await page.locator('input[accept*=".json"]').setInputFiles({
    name: mappingDownload.suggestedFilename(),
    mimeType: "application/json",
    buffer: await readFile(await mappingDownload.path()),
  });
  await page.locator('input[accept=".xlsx,.xlsm"]').setInputFiles({
    name: excelDownload.suggestedFilename(),
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: await readFile(await excelDownload.path()),
  });
  await page.getByRole("button", { name: "①過去＋③将来データ" }).click();
  await page.getByRole("button", { name: "ベース事業＋補助事業" }).click();
  await page.getByRole("button", { name: "取込内容を確認" }).click();

  await expect(page.locator(".excel-mapping-status")).toContainText("エラー 0件");
  await expect(page.locator(".excel-mapping-preview")).toContainText("companyPL.baseYear.2-1");
  await expect(page.locator(".excel-mapping-preview")).toContainText("projectPL.baseYear.7-1");
  await expect(page.locator(".excel-mapping-preview")).toContainText("balanceSheet.latest.1-1");
  await page.getByRole("button", { name: "確認した値を反映" }).click();
  await page.getByRole("button", { name: "① 過去データ入力" }).click();
  await expect(page.getByRole("row", { name: /^1-1 資産総額 / }).getByRole("textbox").nth(2)).toHaveValue("2,200,000");
  await page.getByRole("button", { name: "③ 将来データ入力" }).click();
  await expect(page.getByRole("button", { name: "過去3期から会計前提を設定" })).toBeVisible();
  await expect(page.getByLabel("2028年 売上高（手入力固定値）")).toHaveCount(1);
  await expect(page.getByLabel("2028年 売上高（手入力固定値）")).toHaveValue("700,000");
  await expect(page.getByLabel("2028年 うち従業員の給与（手入力固定値）")).toHaveCount(0);
  await page.getByRole("button", { name: "データ入出力" }).click();
  await page.getByRole("button", { name: "別Excelとして出力" }).click();
  await expect(page.locator(".excel-mapping-status")).toContainText("会計前提を設定してから");
  await page.getByRole("button", { name: "③ 将来データ入力" }).click();
  await page.getByRole("button", { name: "過去3期から会計前提を設定" }).click();
  await expect(page.getByRole("button", { name: "過去3期から会計前提を設定" })).toHaveCount(0);
  await expect(page.getByLabel("2028年 売上高（空欄は自動予測）")).toHaveAttribute("placeholder", "2,700,000");
  await expect(page.getByLabel("2028年 うち従業員の給与（空欄は自動予測）")).toHaveCount(2);
  await page.getByRole("button", { name: "② 15指標・目標" }).click();
  await expect(page.getByLabel("補助事業投資額 固定値")).toHaveValue("2,000,000");
  await expect(page.getByLabel("補助事業投資額 固定値")).not.toHaveAttribute("aria-invalid", "true");
});

test("Excel読み込み画面と③で将来PLの入力方式を相互に切り替えられる", async ({ page }) => {
  await openStandalone(page, 1440);
  await page.getByRole("button", { name: "データ入出力" }).click();

  await page.getByRole("button", { name: "ベース事業＋補助事業" }).click();
  await page.getByRole("button", { name: "③ 将来データ入力" }).click();
  await expect(page.getByRole("button", { name: "ベース事業PLを入力" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "データ入出力" }).click();
  await expect(page.getByRole("button", { name: "ベース事業＋補助事業" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "全社＋補助事業" }).click();
  await page.getByRole("button", { name: "③ 将来データ入力" }).click();
  await expect(page.getByRole("button", { name: "全社PLを入力" })).toHaveAttribute("aria-pressed", "true");
});

test("切り分けなし入力サンプルは全社と補助事業が一致する状態で読み込める", async ({ page }) => {
  await openStandalone(page, 1440);
  await page.getByRole("button", { name: "データ入出力" }).click();
  await page.getByRole("button", { name: "切り分けなしケース（全社＝補助事業）" }).click();
  await page.getByRole("button", { name: "① 過去データ入力" }).click();

  await expect(page.getByRole("button", { name: "補助事業との切り分けなし" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("会社全体の入力値をそのまま補助事業として扱います。")).toBeVisible();
  await expect(page.getByRole("heading", { name: "補助事業（7-10）" })).toHaveCount(0);
});

test("切り分けなしでは全社入力だけを使いベース事業の画面を出さない", async ({ page }) => {
  await openStandalone(page, 1440);

  await page.getByRole("button", { name: "補助事業との切り分けなし" }).click();
  await expect(page.getByText("会社全体の入力値をそのまま補助事業として扱います。")).toBeVisible();
  await expect(page.getByRole("heading", { name: "補助事業PL（過去3期実績）" })).toHaveCount(0);

  await page.getByRole("button", { name: /年度別PL/ }).click();
  await expect(page.getByRole("heading", { name: "ベース事業PL（モデル内訳・申請書外）" })).toHaveCount(0);

  await page.getByRole("button", { name: "⑤ 診断" }).click();
  await expect(page.getByRole("heading", { name: "5. 補助事業とベース事業の比較" })).toHaveCount(0);
});

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

test("balance-sheet codes stay aligned while only labels follow the A002 hierarchy", async ({ page }) => {
  await openStandalone(page, 1440);
  const positions = await page.locator(".balance-sheet-row-title").evaluateAll((titles) =>
    Object.fromEntries(titles.map((title) => {
      const code = title.querySelector(".balance-sheet-row-code");
      const label = title.querySelector(".balance-sheet-row-label");
      const labelStyle = label ? getComputedStyle(label) : null;
      return [code?.textContent ?? "", {
        codeLeft: code?.getBoundingClientRect().left ?? 0,
        labelTextLeft: (label?.getBoundingClientRect().left ?? 0) + Number.parseFloat(labelStyle?.paddingInlineStart ?? "0"),
      }];
    })));

  const codeLefts = Object.values(positions).map((position) => position.codeLeft);
  expect(Math.max(...codeLefts) - Math.min(...codeLefts)).toBeLessThanOrEqual(1);
  expect(positions["1-2"].labelTextLeft).toBeGreaterThan(positions["1-1"].labelTextLeft);
  expect(positions["1-3"].labelTextLeft).toBeGreaterThan(positions["1-2"].labelTextLeft);
  expect(positions["1-5"].labelTextLeft).toBeGreaterThan(positions["1-4"].labelTextLeft);
  expect(positions["1-6"].labelTextLeft).toBeGreaterThan(positions["1-5"].labelTextLeft);
  expect(Math.abs(positions["1-19"].labelTextLeft - positions["1-1"].labelTextLeft)).toBeLessThanOrEqual(1);
  expect(Math.abs(positions["1-22"].labelTextLeft - positions["1-20"].labelTextLeft)).toBeLessThanOrEqual(1);
});

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

  const labelCollisionReport = await page.evaluate(() => {
    const labelGroups = Array.from(document.querySelectorAll(".diagnostic-detail-layout .trend-chart-point-label-group"));
    const linePaths = Array.from(document.querySelectorAll(".diagnostic-detail-layout .trend-chart-line"));
    const boxes = labelGroups.map((group) => ({ group, box: group.getBBox() }));
    const labelsOverlap = boxes.some((left, leftIndex) => boxes.slice(leftIndex + 1).some((right) =>
      left.box.x < right.box.x + right.box.width &&
      left.box.x + left.box.width > right.box.x &&
      left.box.y < right.box.y + right.box.height &&
      left.box.y + left.box.height > right.box.y));
    const unprotectedLineCollisions = boxes.filter(({ group, box }) => {
      if (group.getAttribute("data-needs-background") === "true") return false;
      return linePaths.some((path) => {
        const length = path.getTotalLength();
        for (let distance = 0; distance <= length; distance += 1) {
          const point = path.getPointAtLength(distance);
          if (
            point.x >= box.x &&
            point.x <= box.x + box.width &&
            point.y >= box.y &&
            point.y <= box.y + box.height
          ) return true;
        }
        return false;
      });
    }).length;
    const fallbackCount = labelGroups.filter((group) => group.getAttribute("data-needs-background") === "true").length;
    const backgroundCount = document.querySelectorAll(".diagnostic-detail-layout .trend-chart-point-label-bg").length;
    return { labelsOverlap, unprotectedLineCollisions, fallbackCount, backgroundCount };
  });
  expect(labelCollisionReport.labelsOverlap).toBe(false);
  expect(labelCollisionReport.unprotectedLineCollisions).toBe(0);
  expect(labelCollisionReport.backgroundCount).toBe(labelCollisionReport.fallbackCount);

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
