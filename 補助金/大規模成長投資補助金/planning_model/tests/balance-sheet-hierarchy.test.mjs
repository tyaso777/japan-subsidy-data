import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const inputRowsBlock = pageSource.match(/const balanceSheetInputRows:[\s\S]*?= \[([\s\S]*?)\n\];/)?.[1] ?? "";
const editorRowsBlock = pageSource.match(/function BalanceSheetEditor[\s\S]*?const rows:[\s\S]*?= \[([\s\S]*?)\n  \];/)?.[1] ?? "";

const indentOf = (block, code) => {
  const line = block.split("\n").find((candidate) => candidate.includes(`code: "${code}"`));
  assert.ok(line, `${code}の行定義が見つかりません`);
  return Number(line.match(/indentLevel:\s*(\d)/)?.[1] ?? 0);
};

test("過去B/Sの入力行は第6次A002と同じ階層を使う", () => {
  const expected = new Map([
    ["1-1", 0],
    ["1-2", 1],
    ["1-3", 2],
    ["1-4", 1],
    ["1-5", 2],
    ["1-6", 3],
    ["1-7", 3],
    ["1-8", 3],
    ["1-9", 2],
    ["1-10", 3],
    ["1-13", 1],
    ["1-14", 2],
    ["1-15", 3],
    ["1-16", 2],
    ["1-17", 3],
    ["1-19", 0],
    ["1-20", 1],
    ["1-21", 2],
    ["1-24", 0],
  ]);

  for (const [code, indentLevel] of expected) {
    assert.equal(indentOf(inputRowsBlock, code), indentLevel, `${code}の階層`);
  }
});

test("過去B/Sの自動計算行も第6次A002と同じ階層を使う", () => {
  const expected = new Map([
    ["1-11", 1],
    ["1-12", 0],
    ["1-18", 1],
    ["1-22", 1],
    ["1-23", 0],
    ["1-25", 0],
  ]);

  for (const [code, indentLevel] of expected) {
    assert.equal(indentOf(editorRowsBlock, code), indentLevel, `${code}の階層`);
  }
});

test("過去B/Sは項目番号を揃え、ラベル部分だけを字下げする", () => {
  assert.match(
    pageSource,
    /function BalanceSheetRowTitle[\s\S]*?className="balance-sheet-row-code"[^>]*>\{code\}<\/span>[\s\S]*?className=\{`balance-sheet-row-label pl-row-indent-\$\{indentLevel\}`\}[^>]*>\{label\}<\/span>/,
  );
  assert.match(
    pageSource,
    /BalanceSheetEditor[\s\S]*?<BalanceSheetRowTitle code=\{item\.code\} label=\{item\.label\} indentLevel=\{item\.indentLevel\}/,
  );
});
