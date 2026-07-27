import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "visual-layout.spec.mjs",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.001,
      scale: "css",
    },
  },
  use: {
    browserName: "chromium",
    locale: "ja-JP",
    colorScheme: "light",
    deviceScaleFactor: 1,
  },
  outputDir: ".artifact-qa/playwright-results",
  snapshotPathTemplate: "{testDir}/visual-layout.spec.mjs-snapshots/{arg}{ext}",
});
