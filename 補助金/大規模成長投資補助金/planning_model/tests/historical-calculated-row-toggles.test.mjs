import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pageSource = fs.readFileSync(path.join(root, "app", "page.tsx"), "utf8");
const stylesheet = fs.readFileSync(path.join(root, "app", "globals.css"), "utf8");

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

test("historical balance-sheet calculated-row toggle stays with a sticky table subtitle", () => {
  assert.match(pageSource, /<article className="panel table-panel balance-sheet-panel">/);
  assert.match(
    pageSource,
    /<h3 className="manual-table-heading"><span>貸借対照表等（1-1～1-25：過去3期実績）<\/span>[\s\S]*?<button type="button" className="calculated-row-toggle"/,
  );
  assert.doesNotMatch(pageSource, /<div className="historical-table-actions">/);
  assert.match(stylesheet, /\.balance-sheet-panel > \.panel-heading \{ position: static; \}/);
  assert.match(
    stylesheet,
    /\.balance-sheet-panel > \.manual-table-heading \{[^}]*position: sticky;[^}]*top: 46px;[^}]*z-index: 18;/,
  );
});

test("historical balance-sheet unused-row toggle is grouped inside the same sticky subtitle", () => {
  assert.match(
    pageSource,
    /<h3 className="manual-table-heading"><span>貸借対照表等（1-1～1-25：過去3期実績）<\/span><div className="balance-sheet-heading-actions">/,
  );
  assert.match(
    pageSource,
    /<label className="balance-sheet-omit-unused"><input type="checkbox" checked=\{omitUnused\} onChange=\{\(event\) => onToggleUnused\(event\.target\.checked\)\} \/><span>シミュレーションに使わないB\/S項目を省略する<\/span><\/label>/,
  );
  assert.doesNotMatch(pageSource, /<div className="balance-sheet-display-options">/);
  assert.match(stylesheet, /\.balance-sheet-heading-actions \{[^}]*display: flex;[^}]*align-items: center;/);
});
