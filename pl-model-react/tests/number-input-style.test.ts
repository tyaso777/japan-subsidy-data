// @vitest-environment node
import { describe, expect, it } from 'vitest';
import stylesheet from '../src/styles.css?raw';

describe('number input appearance', () => {
  it('removes the browser spinner buttons from every numeric input', () => {
    expect(stylesheet).toMatch(/input\[type=["']?number["']?\][^{]*\{[^}]*appearance:\s*textfield/s);
    expect(stylesheet).toMatch(/input\[type=["']?number["']?\]::-webkit-inner-spin-button[^{]*\{[^}]*-webkit-appearance:\s*none/s);
    expect(stylesheet).toMatch(/input\[type=["']?number["']?\]::-webkit-outer-spin-button[^{]*\{[^}]*-webkit-appearance:\s*none/s);
  });
});
