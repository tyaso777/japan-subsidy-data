import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const stylesheet = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

function cssRule(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = stylesheet.match(new RegExp(`${escapedSelector}\\s*\\{([^}]+)\\}`));
  assert.ok(match, `CSS rule not found: ${selector}`);
  return match[1];
}

test("three-year actuals table allocates every desktop column within its own width", () => {
  const tableRule = cssRule(".actuals-three-year-table table");
  const labelRule = cssRule(".actuals-three-year-table th:first-child");
  const yearRule = cssRule(
    ".actuals-three-year-table th:not(:first-child), .actuals-three-year-table td:not(:first-child)",
  );
  const inputRule = cssRule(".actuals-three-year-table td input");

  assert.match(tableRule, /width:\s*100%\s*!important/);
  assert.match(tableRule, /min-width:\s*0\s*!important/);
  assert.match(tableRule, /table-layout:\s*fixed/);
  assert.match(labelRule, /width:\s*40%\s*!important/);
  assert.match(labelRule, /min-width:\s*0\s*!important/);
  assert.match(yearRule, /width:\s*20%\s*!important/);
  assert.match(yearRule, /min-width:\s*0\s*!important/);
  assert.match(inputRule, /width:\s*100%/);
  assert.match(inputRule, /min-width:\s*0/);
  assert.match(inputRule, /max-width:\s*100%/);
  assert.match(inputRule, /box-sizing:\s*border-box/);

  for (const tableWidth of [640, 720, 860, 1040, 1440]) {
    const labelWidth = tableWidth * 0.4;
    const yearWidth = tableWidth * 0.2;
    const finalColumnRightEdge = labelWidth + yearWidth * 3;
    assert.equal(
      finalColumnRightEdge,
      tableWidth,
      `the latest-year column must end at the table edge at ${tableWidth}px`,
    );
  }
});

test("narrow screens retain an explicit scrollable table instead of clipping controls", () => {
  assert.match(
    stylesheet,
    /@media \(max-width: 720px\)[^{]*\{[\s\S]*?\.actuals-three-year-table table \{ min-width: 620px !important; \}/,
  );
  assert.match(
    stylesheet,
    /\.actuals-three-year-table th:not\(:first-child\), \.actuals-three-year-table td:not\(:first-child\) \{ width: 124px !important; \}/,
  );
  assert.match(
    stylesheet,
    /\.balance-sheet-table \{[^}]*overflow-x: auto; overflow-y: visible;/,
  );
});
