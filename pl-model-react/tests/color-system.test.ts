import { describe, expect, it } from 'vitest';
import stylesheet from '../src/styles.css?raw';

describe('neutral application color system', () => {
  it('uses a neutral gray canvas, white panels, and a lighter nested surface without yellow tint', () => {
    expect(stylesheet).toContain('--color-canvas: #f3f5f6;');
    expect(stylesheet).toContain('--color-surface: #ffffff;');
    expect(stylesheet).toContain('--color-card: #ffffff;');
    expect(stylesheet).toContain('--color-background: #f8fafb;');
    expect(stylesheet).toContain('--color-accent: #eef1f3;');
    expect(stylesheet).not.toMatch(/#fffdf8|#f4f2ec|#e8e6df/i);
  });
});
