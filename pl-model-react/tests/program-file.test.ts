import { describe, expect, it } from 'vitest';
import { parseProgramScript, serializeProgramScript } from '../src/domain/program-file';
import { createDefaultProgram } from '../src/domain/timeline';

describe('制度JSファイル', () => {
  it('実行せずにwindow.PL_SUBSIDY_PROGRAM代入形式を往復する', () => {
    const program = createDefaultProgram();
    const source = serializeProgramScript(program);
    expect(source).toContain('window.PL_SUBSIDY_PROGRAM =');
    expect(parseProgramScript(source)).toEqual(program);
  });

  it('任意コードと不正な制度定義を拒否する', () => {
    expect(() => parseProgramScript('alert(1)')).toThrow('制度JS');
    expect(() => parseProgramScript('window.PL_SUBSIDY_PROGRAM = {"bad":true};')).toThrow();
  });

  it('同梱ファイルで使う静的JSオブジェクト記法も実行せず読み込む', () => {
    const json = serializeProgramScript(createDefaultProgram()).replace(/"([A-Za-z][A-Za-z0-9]*)":/g, '$1:').replace(/"([^"\\]*)"/g, "'$1'");
    expect(parseProgramScript(json).program.id).toBe('generic-growth-subsidy');
  });

  it('0区間・重複ID・存在しない区間や特別年への参照を拒否する', () => {
    const invalidCases = [
      (program: ReturnType<typeof createDefaultProgram>) => { program.definitions.periods = []; program.timeline.periods = []; },
      (program: ReturnType<typeof createDefaultProgram>) => { program.definitions.periods[1].id = program.definitions.periods[0].id; },
      (program: ReturnType<typeof createDefaultProgram>) => { program.definitions.specialYears[1].anchor = { type: 'periodEnd', periodId: 'missing' }; },
      (program: ReturnType<typeof createDefaultProgram>) => { program.definitions.managementMetrics[0].timePoints[0].anchor = { type: 'specialYear', specialYearId: 'missing' }; },
    ];
    for (const invalidate of invalidCases) {
      const program = createDefaultProgram();
      invalidate(program);
      expect(() => parseProgramScript(serializeProgramScript(program))).toThrow();
    }
  });
});
