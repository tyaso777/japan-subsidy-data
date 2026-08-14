import { evaluateFormula, type FormulaContext } from './formula-engine';

export type NumericDefinition = { id: string; label?: string; formula: string };

export const commonPlFormulaInputs = new Set([
  '売上高', '売上原価', '原価内減価償却費', '売上総利益', '販売費及び一般管理費',
  '営業利益', '従業員給与総額', '従業員人件費', '役員人件費', '販管費内減価償却費',
  '減価償却費', '研究開発費', 'その他販管費', '営業外損益', '経常利益', '特別損益',
  '税引前当期純利益', '当期純利益', '従業員数（就業時間換算）', '役員数',
  '従業員1人当たり給与支給総額', '純資産', '総資産',
]);

export class DefinitionGraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DefinitionGraphError';
  }
}

export function extractFormulaReferences(formula: string): string[] {
  return [...formula.matchAll(/\[([^\]\r\n]+)]\[([^\]\r\n]+)]/g)].map((match) => match[1].trim());
}

export function sortNumericDefinitions<T extends NumericDefinition>(definitions: T[], availableInputs: Set<string>): T[] {
  const nameOf = (definition: T) => definition.label ?? definition.id;
  const byName = new Map(definitions.map((definition) => [nameOf(definition), definition]));
  if (byName.size !== definitions.length) throw new DefinitionGraphError('数値定義の名称が重複しています');
  const dependencies = new Map<string, string[]>();
  for (const definition of definitions) {
    const references = [...new Set(extractFormulaReferences(definition.formula))];
    const missing = references.find((reference) => !byName.has(reference) && !availableInputs.has(reference));
    if (missing) throw new DefinitionGraphError(`${definition.id}が未定義の値「${missing}」を参照しています`);
    dependencies.set(nameOf(definition), references.filter((reference) => byName.has(reference)));
  }

  const state = new Map<string, 'visiting' | 'visited'>();
  const ordered: T[] = [];
  const visit = (id: string, path: string[]) => {
    if (state.get(id) === 'visited') return;
    if (state.get(id) === 'visiting') throw new DefinitionGraphError(`循環参照があります: ${[...path, id].join(' → ')}`);
    state.set(id, 'visiting');
    for (const dependency of dependencies.get(id) ?? []) visit(dependency, [...path, id]);
    state.set(id, 'visited');
    ordered.push(byName.get(id)!);
  };
  for (const definition of definitions) visit(nameOf(definition), []);
  return ordered;
}

export function evaluateNumericDefinitions<T extends NumericDefinition & { outputPoint: string }>(definitions: T[], context: FormulaContext): Record<string, number> {
  const ordered = sortNumericDefinitions(definitions, new Set(Object.keys(context.values)));
  const working: FormulaContext = { values: structuredClone(context.values), years: { ...context.years } };
  const results: Record<string, number> = {};
  for (const definition of ordered) {
    const value = evaluateFormula(definition.formula, working);
    const name = definition.label ?? definition.id;
    results[name] = value;
    working.values[name] = { ...(working.values[name] ?? {}), [definition.outputPoint]: value };
  }
  return results;
}
