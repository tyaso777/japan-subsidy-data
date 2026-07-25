import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [pageSource, stylesheet] = await Promise.all([
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
]);

test("forecast-condition grouped headings are centered over their exact columns", () => {
  assert.match(
    pageSource,
    /className="driver-statutory-heading">制度上の必須条件<small>編集不可<\/small>/,
  );
  assert.equal(
    pageSource.match(/colSpan=\{2\} className="driver-period-heading"/g)?.length,
    2,
  );
  assert.equal(
    pageSource.match(/className="driver-bound-heading"/g)?.length,
    4,
  );
  assert.match(
    stylesheet,
    /\.driver-target-table \.driver-statutory-heading, \.driver-target-table \.driver-period-heading, \.driver-target-table \.driver-bound-heading \{ text-align: center !important; \}/,
  );
});

test("forecast-condition controls are centered in their cells while numbers remain right aligned", () => {
  assert.match(
    stylesheet,
    /\.driver-target-table \.statutory-condition, \.driver-target-table \.driver-period-bound, \.driver-target-table \.driver-fixed-period-value, \.driver-target-table \.driver-fixed-common-value \{ text-align: center; \}/,
  );
  assert.match(
    stylesheet,
    /\.driver-target-table \.driver-period-bound input, \.driver-target-table \.driver-fixed-period-value input, \.driver-target-table \.driver-fixed-common-value input \{ display: block; margin-inline: auto; text-align: right; \}/,
  );
});
