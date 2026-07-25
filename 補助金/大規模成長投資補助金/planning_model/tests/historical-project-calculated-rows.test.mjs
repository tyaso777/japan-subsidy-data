import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

test("historical project PL shows every applicable calculated row by default", () => {
  assert.match(
    pageSource,
    /const visibleProjectActualRows = omitProjectActualCalculated \? projectOfficialDisplayRows\.filter\(\(item\) => item\.input\) : projectOfficialDisplayRows\.filter\(\(item\) => !item\.fixed\)/,
  );
  assert.match(pageSource, /visibleProjectActualRows\.map\(\(item\) =>/);
});

test("historical project PL can hide and restore calculated rows", () => {
  assert.match(
    pageSource,
    /const \[omitProjectActualCalculated, setOmitProjectActualCalculated\] = useState\(false\)/,
  );
  assert.match(
    pageSource,
    /aria-pressed=\{omitProjectActualCalculated\}[\s\S]*?setOmitProjectActualCalculated\(\(current\) => !current\)/,
  );
  assert.match(
    pageSource,
    /omitProjectActualCalculated \? "自動計算項目を表示する" : "自動計算項目を省略する"/,
  );
});

test("historical calculated values preserve the distinction between blank and zero", () => {
  assert.match(
    pageSource,
    /const calculatedValue = item\.get\(historical, index, emptyDrivers\);[\s\S]*?calculatedValue === undefined \? "—" : number\(calculatedValue, item\.digits \?\? 2\)/,
  );
});
