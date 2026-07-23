import { spawnSync } from "node:child_process";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

const projectDirectory = process.cwd();
const runtimePath = path.join(projectDirectory, ".sample-proposal-test-runtime.mjs");

try {
  await build({
    absWorkingDir: projectDirectory,
    entryPoints: [path.join(projectDirectory, "app", "sample-proposals.ts")],
    outfile: runtimePath,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    packages: "external",
  });
  const testFiles = (await readdir(path.join(projectDirectory, "tests")))
    .filter((name) => name.endsWith(".test.mjs"))
    .map((name) => path.join("tests", name));
  const result = spawnSync(process.execPath, ["--test", ...testFiles], {
    cwd: projectDirectory,
    stdio: "inherit",
  });
  process.exitCode = result.status ?? 1;
} finally {
  await rm(runtimePath, { force: true });
}
