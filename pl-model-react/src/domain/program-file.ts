import { programConfigurationSchema } from './program-schema';
import type { ProgramConfiguration } from './types';

const assignment = /^\s*window\.PL_SUBSIDY_PROGRAM\s*=\s*([\s\S]*?)\s*;?\s*$/;

export function serializeProgramScript(program: ProgramConfiguration): string {
  return `window.PL_SUBSIDY_PROGRAM = ${JSON.stringify(program, null, 2)};\n`;
}

export function parseProgramScript(source: string): ProgramConfiguration {
  const match = source.match(assignment);
  if (!match) throw new Error('制度JSは window.PL_SUBSIDY_PROGRAM = {...}; 形式で指定してください');
  let value: unknown;
  try {
    value = JSON.parse(match[1]);
  } catch {
    try {
      const json = match[1]
        .replace(/'((?:\\.|[^'\\])*)'/g, (_whole, body: string) => JSON.stringify(body.replace(/\\'/g, "'").replace(/\\\\/g, '\\')))
        .replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)/g, '$1"$2"$3')
        .replace(/,\s*([}\]])/g, '$1');
      value = JSON.parse(json);
    } catch { throw new Error('制度JSのオブジェクトは安全なJSONまたは静的オブジェクト形式で記述してください'); }
  }
  return programConfigurationSchema.parse(value);
}
