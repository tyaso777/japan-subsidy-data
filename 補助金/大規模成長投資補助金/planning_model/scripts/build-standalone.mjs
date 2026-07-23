import { build } from "esbuild";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const cssPath = path.join(projectDirectory, "app", "globals.css");
const outputPath = path.join(projectDirectory, "成長投資計画_数値設計ラボ.html");
const buildDirectory = path.join(projectDirectory, ".standalone-build");

await rm(buildDirectory, { recursive: true, force: true });
await mkdir(path.join(buildDirectory, "app"), { recursive: true });
await Promise.all([
  copyFile(path.join(projectDirectory, "app", "standalone-entry.tsx"), path.join(buildDirectory, "app", "standalone-entry.tsx")),
  copyFile(path.join(projectDirectory, "app", "page.tsx"), path.join(buildDirectory, "app", "page.tsx")),
  copyFile(path.join(projectDirectory, "app", "application-rules.ts"), path.join(buildDirectory, "app", "application-rules.ts")),
  copyFile(path.join(projectDirectory, "app", "model.ts"), path.join(buildDirectory, "app", "model.ts")),
  copyFile(path.join(projectDirectory, "app", "input-values.ts"), path.join(buildDirectory, "app", "input-values.ts")),
  copyFile(path.join(projectDirectory, "app", "metric-groups.ts"), path.join(buildDirectory, "app", "metric-groups.ts")),
  copyFile(path.join(projectDirectory, "app", "proposal-io.ts"), path.join(buildDirectory, "app", "proposal-io.ts")),
  copyFile(path.join(projectDirectory, "app", "proposal-optimization.ts"), path.join(buildDirectory, "app", "proposal-optimization.ts")),
  copyFile(path.join(projectDirectory, "app", "report-data.ts"), path.join(buildDirectory, "app", "report-data.ts")),
  copyFile(path.join(projectDirectory, "app", "sample-proposals.ts"), path.join(buildDirectory, "app", "sample-proposals.ts")),
]);
let bundle;
try {
  bundle = await build({
    absWorkingDir: buildDirectory,
    entryPoints: [path.join(buildDirectory, "app", "standalone-entry.tsx")],
    nodePaths: [path.join(projectDirectory, "node_modules")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: ["es2022"],
    charset: "utf8",
    jsx: "automatic",
    minify: true,
    legalComments: "none",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
  });
} finally {
  await rm(buildDirectory, { recursive: true, force: true });
}

const javascript = bundle.outputFiles.find((file) => file.path.endsWith(".js")) ?? bundle.outputFiles[0];
if (!javascript) throw new Error("The standalone JavaScript bundle was not generated.");

const css = (await readFile(cssPath, "utf8"))
  .replace(/^@import\s+["']tailwindcss["'];?\s*/m, "")
  .replaceAll("</style", "<\\/style");
const script = javascript.text.replaceAll("</script", "<\\/script");

const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="大規模成長投資補助金のPL・15指標・目標競合を検証する単一HTMLモデル">
  <title>成長投資計画 数値設計ラボ</title>
  <style>${css}</style>
</head>
<body>
  <div id="root"><main style="padding:2rem">数値設計ラボを読み込んでいます…</main></div>
  <noscript>このHTMLの計算機能を使うにはJavaScriptを有効にしてください。</noscript>
  <script>${script}</script>
</body>
</html>
`;

await writeFile(outputPath, html, "utf8");
console.log(outputPath);
