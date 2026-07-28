import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("long mapping filenames cannot widen their cards or file buttons", () => {
  assert.match(
    css,
    /\.excel-mapping-steps > section\s*\{[^}]*grid-template-columns:\s*auto minmax\(0,\s*1fr\);[^}]*min-width:\s*0;/s,
  );
  assert.match(
    css,
    /\.excel-mapping-steps > section > div\s*\{[^}]*min-width:\s*0;/s,
  );
  assert.match(
    css,
    /\.excel-mapping-steps small\s*\{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s,
  );
  assert.match(
    css,
    /\.excel-mapping-steps \.proposal-import-button\s*\{[^}]*box-sizing:\s*border-box;[^}]*width:\s*100%;[^}]*max-width:\s*100%;/s,
  );
});
