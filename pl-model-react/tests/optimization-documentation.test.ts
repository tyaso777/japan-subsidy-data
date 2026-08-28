// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('最適化方法ドキュメント', () => {
  it('簡易説明と数学的仕様を同じ配布ファイルに収録する', () => {
    const html = readFileSync('public/docs/optimization-methods.html', 'utf8');

    expect(html).toContain('はじめに：4方式の簡易説明');
    expect(html).toContain('数学的仕様');
    expect(html).toContain('最小変更');
    expect(html).toContain('バランス');
    expect(html).toContain('最少項目');
    expect(html).toContain('優先順位');
    expect(html).toContain('J<sub>minimum</sub>');
    expect(html).toContain('J<sub>balanced</sub>');
    expect(html).toContain('J<sub>sparse</sub>');
    expect(html).toContain('座標降下法');
    expect(html).toContain('大域的最適解を保証しません');
    expect(html).toContain('制約集合');
    expect(html).toContain('水準外探索とドメイン制約');
    expect(html).toContain('数学的に達成不能');
    expect(html).toContain('通常許容する調整余地');
    expect(html).toContain('改善効率が高い順');
    expect(html).toContain('水準内最適化');
    expect(html).toContain('水準外最適化');
    expect(html).toContain('ドメイン制約');
    expect(html).toContain('任意の安全限界');
    expect(html).not.toContain('10,000');
  });
});
