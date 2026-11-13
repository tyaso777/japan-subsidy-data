import { createRequire } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(new URL('../../../pl-model-react/package.json', import.meta.url));
const { chromium } = require('playwright');

test('Median filters show and apply independent comparisons at desktop and narrow widths', async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const width of [1440, 768]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(new URL('../html/public_metrics_dashboard.html', import.meta.url).href);
      await page.locator('#medianFilterRows').locator('xpath=ancestor::details[1]').locator('summary').click();
      const select = page.locator('[data-median-filter="investment_sales_ratio_pct"]');
      const labels = await select.locator('option').allTextContents();
      assert.equal(labels.length, 6);
      assert.ok(labels.includes('条件なし（93件）'));
      assert.ok(labels.includes('申請者中央値以上～採択者中央値未満（0件）'));
      for (const value of ['below', 'above', 'applicant_above', 'accepted_below']) {
        const label = await select.locator(`option[value="${value}"]`).textContent();
        const expected = Number(label.match(/（(\d+)件）/)[1]);
        assert.ok(expected > 0, label);
        await select.selectOption(value);
        assert.equal(await page.locator('#count').textContent(), `${expected} / 381件`);
      }
      await select.selectOption('between');
      assert.equal(await page.locator('#count').textContent(), '0 / 381件');
      await select.selectOption('');
      assert.equal(await page.locator('#count').textContent(), '93 / 381件');
      assert.deepEqual(errors, []);
      console.log(`${width}px: ${labels.join(' / ')}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
