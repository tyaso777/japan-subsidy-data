import { build } from "esbuild";
import { rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectDirectory = process.cwd();
const temporaryOutput = path.join(projectDirectory, ".sample-proposal-build.mjs");
try {
  await build({
    absWorkingDir: projectDirectory,
    entryPoints: [path.join(projectDirectory, "scripts", "sample-proposal-entry.ts")],
    outfile: temporaryOutput,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    packages: "external",
  });
  await import(`${pathToFileURL(temporaryOutput).href}?v=${Date.now()}`);
} finally {
  await rm(temporaryOutput, { force: true });
}
