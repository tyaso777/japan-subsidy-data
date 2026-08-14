export type FormulaContext = {
  values: Record<string, Record<string, number>>;
  years: Record<string, number>;
};

type Token =
  | { type: 'number'; value: number }
  | { type: 'reference'; definition: string; point: string }
  | { type: 'identifier'; value: string }
  | { type: 'operator'; value: '+' | '-' | '*' | '/' | '^' }
  | { type: 'paren'; value: '(' | ')' }
  | { type: 'comma' }
  | { type: 'eof' };

export class FormulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormulaError';
  }
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const rest = source.slice(index);
    const whitespace = rest.match(/^\s+/);
    if (whitespace) { index += whitespace[0].length; continue; }
    const reference = rest.match(/^\[([^\]\r\n]+)]\[([^\]\r\n]+)]/);
    if (reference) {
      tokens.push({ type: 'reference', definition: reference[1].trim(), point: reference[2].trim() });
      index += reference[0].length;
      continue;
    }
    const numeric = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
    if (numeric) { tokens.push({ type: 'number', value: Number(numeric[0]) }); index += numeric[0].length; continue; }
    const identifier = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (identifier) { tokens.push({ type: 'identifier', value: identifier[0] }); index += identifier[0].length; continue; }
    const char = source[index];
    if ('+-*/^'.includes(char)) { tokens.push({ type: 'operator', value: char as '+' | '-' | '*' | '/' | '^' }); index += 1; continue; }
    if (char === '(' || char === ')') { tokens.push({ type: 'paren', value: char }); index += 1; continue; }
    if (char === ',') { tokens.push({ type: 'comma' }); index += 1; continue; }
    throw new FormulaError(`使用できない文字です: ${char}`);
  }
  tokens.push({ type: 'eof' });
  return tokens;
}

export function evaluateFormula(source: string, context: FormulaContext): number {
  const tokens = tokenize(source);
  let position = 0;
  const peek = () => tokens[position];
  const take = () => tokens[position++];

  function expression(minPrecedence = 0): number {
    let left = unary();
    const precedence = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 } as const;
    while (peek().type === 'operator') {
      const operator = peek() as Extract<Token, { type: 'operator' }>;
      const rank = precedence[operator.value];
      if (rank < minPrecedence) break;
      take();
      const right = expression(rank + (operator.value === '^' ? 0 : 1));
      if (operator.value === '+') left += right;
      else if (operator.value === '-') left -= right;
      else if (operator.value === '*') left *= right;
      else if (operator.value === '/') {
        if (right === 0) throw new FormulaError('ゼロで除算できません');
        left /= right;
      } else left **= right;
    }
    return left;
  }

  function unary(): number {
    const token = peek();
    if (token.type === 'operator' && (token.value === '+' || token.value === '-')) {
      take();
      const value = unary();
      return token.value === '-' ? -value : value;
    }
    return primary();
  }

  function pointArgument(): string {
    const token = take();
    if (token.type !== 'identifier') throw new FormulaError('時点名が必要です');
    return token.value;
  }

  function primary(): number {
    const token = take();
    if (token.type === 'number') return token.value;
    if (token.type === 'reference') {
      const value = context.values[token.definition]?.[token.point];
      if (!Number.isFinite(value)) throw new FormulaError(`参照が見つかりません: [${token.definition}][${token.point}]`);
      return value;
    }
    if (token.type === 'paren' && token.value === '(') {
      const value = expression();
      const close = take();
      if (close.type !== 'paren' || close.value !== ')') throw new FormulaError('閉じ括弧が必要です');
      return value;
    }
    if (token.type === 'identifier') {
      if (token.value !== 'YEARS') throw new FormulaError(`許可されていない関数です: ${token.value}`);
      const open = take();
      if (open.type !== 'paren' || open.value !== '(') throw new FormulaError('YEARSの引数が必要です');
      const from = pointArgument();
      if (take().type !== 'comma') throw new FormulaError('YEARSは2時点を指定します');
      const to = pointArgument();
      const close = take();
      if (close.type !== 'paren' || close.value !== ')') throw new FormulaError('閉じ括弧が必要です');
      const fromYear = context.years[from];
      const toYear = context.years[to];
      if (!Number.isFinite(fromYear) || !Number.isFinite(toYear)) throw new FormulaError('時点の年が見つかりません');
      const years = Math.abs(toYear - fromYear);
      if (!years) throw new FormulaError('YEARSの2時点は異なる年にしてください');
      return years;
    }
    throw new FormulaError('数値、参照または括弧が必要です');
  }

  const result = expression();
  if (peek().type !== 'eof') throw new FormulaError('数式の末尾を解釈できません');
  if (!Number.isFinite(result)) throw new FormulaError('計算結果が有限値ではありません');
  return result;
}
