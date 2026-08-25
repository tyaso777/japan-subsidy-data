import { extractFormulaReferences } from './definition-graph';
import { defaultCommonNumericDefinitions } from './program-schema';
import { buildProgramPlRows, forecastPlRows } from './rows';
import type { CommonNumericDefinition } from './types';

export type PlLogicNode = {
  code: string;
  label: string;
  formula: string;
  dependsOn: string[];
  settings: string[];
};

const logicByCode: Record<string, Omit<PlLogicNode, 'code' | 'label'>> = {
  '1': { formula: '前年売上高 × (1 + 売上成長率) + 開始時増減', dependsOn: [], settings: ['売上高'] },
  '2': { formula: '当年売上高 ÷ 前年売上高 − 1', dependsOn: ['1'], settings: [] },
  '3': { formula: '売上高 × 原価率', dependsOn: ['1'], settings: ['原価率'] },
  '4': { formula: '売上高 × 原価内減価償却費率', dependsOn: ['1'], settings: ['原価内減価償却費率'] },
  '5': { formula: '売上高 − 売上原価', dependsOn: ['1', '3'], settings: [] },
  '6': { formula: '売上総利益 ÷ 売上高', dependsOn: ['5', '1'], settings: [] },
  '7': { formula: '役員人件費 + 従業員人件費 + 販管費内減価償却費 + 研究開発費 + その他販管費', dependsOn: ['8', '11', '14', '15', '15A'], settings: ['その他販管費率'] },
  '8': { formula: '役員数 × 役員1人当たり給与支給総額', dependsOn: ['28', '31'], settings: [] },
  '9': { formula: '役員人件費 × 報酬割合', dependsOn: ['8'], settings: ['役員給与のうち報酬割合'] },
  '10': { formula: '役員人件費 − 役員報酬', dependsOn: ['8', '9'], settings: [] },
  '11': { formula: 'FTE × 1人当たり給与', dependsOn: ['27', '29'], settings: [] },
  '12': { formula: '従業員人件費 × 給与割合', dependsOn: ['11'], settings: ['従業員給与のうち給与割合'] },
  '13': { formula: '従業員人件費 − 従業員給与', dependsOn: ['11', '12'], settings: [] },
  '14': { formula: '売上高 × 販管費内減価償却費率', dependsOn: ['1'], settings: ['販管費内減価償却費率'] },
  '15': { formula: '売上高 × 研究開発費率', dependsOn: ['1'], settings: ['研究開発費の売上高比率'] },
  '15A': { formula: '売上高 × その他販管費率', dependsOn: ['1'], settings: ['その他販管費率'] },
  '16': { formula: '売上総利益 − 販売費及び一般管理費', dependsOn: ['5', '7'], settings: [] },
  '17': { formula: '営業利益 ÷ 売上高', dependsOn: ['16', '1'], settings: [] },
  '17A': { formula: '売上高 × 営業外損益率', dependsOn: ['1'], settings: ['営業外損益の売上高比率'] },
  '18': { formula: '営業利益 + 営業外損益', dependsOn: ['16', '17A'], settings: [] },
  '18A': { formula: '売上高 × 特別損益率', dependsOn: ['1'], settings: ['特別損益の売上高比率'] },
  '19': { formula: '経常利益 + 特別損益', dependsOn: ['18', '18A'], settings: [] },
  '20': { formula: '税引前利益 × (1 − 実効税率)', dependsOn: ['19'], settings: ['実効税率'] },
  '23': { formula: '原価内減価償却費 + 販管費内減価償却費', dependsOn: ['4', '14'], settings: [] },
  '24': { formula: '営業利益 + 人件費 + 減価償却費', dependsOn: ['16', '8', '11', '23'], settings: [] },
  '25': { formula: '当年付加価値額 ÷ 前年付加価値額 − 1', dependsOn: ['24'], settings: [] },
  '27': { formula: '前年FTE × (1 + FTE成長率)', dependsOn: [], settings: ['従業員数（就業時間換算）'] },
  '28': { formula: '前年役員数 × (1 + 成長率)', dependsOn: [], settings: ['役員数'] },
  '29': { formula: '従業員給与総額 ÷ FTE', dependsOn: ['12', '13', '27'], settings: ['1人当たり給与'] },
  '30': { formula: '当年従業員1人当たり給与 ÷ 前年従業員1人当たり給与 − 1', dependsOn: ['29'], settings: ['1人当たり給与'] },
  '31': { formula: '役員人件費 ÷ 役員数', dependsOn: ['8', '28'], settings: ['役員1人当たり給与支給総額'] },
  '32': { formula: '当年役員1人当たり給与 ÷ 前年役員1人当たり給与 − 1', dependsOn: ['31'], settings: ['役員1人当たり給与支給総額'] },
  '33': { formula: '付加価値額 ÷ (FTE + 役員数)', dependsOn: ['24', '27', '28'], settings: [] },
  '34': { formula: '営業利益 + 減価償却費', dependsOn: ['16', '23'], settings: [] },
  '35': { formula: 'EBITDA ÷ 売上高', dependsOn: ['34', '1'], settings: [] },
};

export function buildPlLogicNodes(definitions: CommonNumericDefinition[]): PlLogicNode[] {
  const rows = buildProgramPlRows(forecastPlRows, definitions);
  const codeByLabel = new Map(rows.map((row) => [row.label, row.code]));
  const baseLabelByCode = new Map(forecastPlRows.map((row) => [row.code, row.label]));
  const currentCodes = new Set(rows.map((row) => row.code));
  const resolveCurrentCode = (code: string) => currentCodes.has(code) ? code : codeByLabel.get(baseLabelByCode.get(code) ?? '') ?? code;
  const definitionById = new Map(definitions.map((definition) => [definition.id, definition]));
  return rows.map((row) => {
    const definition = row.definitionId ? definitionById.get(row.definitionId) : undefined;
    if (definition) return {
      code: row.code,
      label: row.label,
      formula: definition.formula,
      dependsOn: extractFormulaReferences(definition.formula).flatMap((label) => codeByLabel.get(label) ?? []),
      settings: [],
    };
    const logic = logicByCode[row.code] ?? { formula: '入力値', dependsOn: [], settings: [] };
    return { code: row.code, label: row.label, ...logic, dependsOn: logic.dependsOn.map(resolveCurrentCode) };
  });
}

export const plLogicNodes: PlLogicNode[] = buildPlLogicNodes(defaultCommonNumericDefinitions.map((definition) => structuredClone(definition)));

export function downstreamCodes(nodes: PlLogicNode[], sourceCode: string): string[] {
  const found = new Set<string>();
  const queue = [sourceCode];
  while (queue.length) {
    const source = queue.shift()!;
    for (const node of nodes) if (!found.has(node.code) && node.dependsOn.includes(source)) {
      found.add(node.code);
      queue.push(node.code);
    }
  }
  return [...found];
}
