import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = join(process.cwd(), 'src');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('sticky実装のアーキテクチャ', () => {
  it('画面側へ生のstickyクラスを書かず共通部品を利用する', () => {
    const allowed = new Set([
      'components/ui/sticky-panel.tsx',
      'components/ui/sticky-surface.tsx',
    ]);
    const violations = sourceFiles(sourceRoot).flatMap((path) => {
      const name = relative(sourceRoot, path).replaceAll('\\', '/');
      if (allowed.has(name)) return [];
      return readFileSync(path, 'utf8').split(/\r?\n/).flatMap((line, index) =>
        /(?:^|[\s'"`:])sticky(?:[\s'"`]|$)/.test(line)
          ? [`${name}:${index + 1}`]
          : [],
      );
    });

    expect(violations).toEqual([]);
  });

  it('固定面のz-indexを画面側へ直接書かず共通レイヤーを利用する', () => {
    const violations = sourceFiles(sourceRoot).flatMap((path) => {
      const name = relative(sourceRoot, path).replaceAll('\\', '/');
      if (name.startsWith('components/ui/sticky-')) return [];
      return readFileSync(path, 'utf8').split(/\r?\n/).flatMap((line, index) =>
        /<Sticky(?:Surface|Panel)\b/.test(line) && /\bz-(?:10|20|30|40|50)\b/.test(line)
          ? [`${name}:${index + 1}`]
          : [],
      );
    });

    expect(violations).toEqual([]);
  });

  it('固定位置の初回計測を描画前に完了する', () => {
    const source = readFileSync(join(sourceRoot, 'lib/sticky-stack.ts'), 'utf8');
    expect(source).toContain('useLayoutEffect');
    expect(source).not.toMatch(/import\s*\{[^}]*\buseEffect\b/);
  });
});
