import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pageSource = fs.readFileSync(path.join(root, "app", "page.tsx"), "utf8");

test("historical company PL can hide and restore calculated rows", () => {
  assert.match(pageSource, /const \[omitCompanyActualCalculated, setOmitCompanyActualCalculated\] = useState\(false\)/);
  assert.match(
    pageSource,
    /const visibleCompanyActualRows = omitCompanyActualCalculated \? companyActualInputRows\.filter\(\(item\) => item\.set\) : companyActualInputRows/,
  );
  assert.match(pageSource, /visibleCompanyActualRows\.map\(\(item\) =>/);
  assert.match(
    pageSource,
    /omitCompanyActualCalculated \? "自動計算項目を表示する" : "自動計算項目を省略する"/,
  );
});

test("historical balance sheet can hide and restore calculated rows independently of unused-row filtering", () => {
  assert.match(pageSource, /const \[omitCalculated, setOmitCalculated\] = useState\(false\)/);
  assert.match(
    pageSource,
    /const scopeRows = omitUnused \? rows\.filter\(\(item\) => item\.code === "1-24"\) : rows/,
  );
  assert.match(
    pageSource,
    /const visibleRows = omitCalculated \? scopeRows\.filter\(\(item\) => item\.field\) : scopeRows/,
  );
  assert.match(
    pageSource,
    /omitCalculated \? "自動計算項目を表示する" : "自動計算項目を省略する"/,
  );
});
