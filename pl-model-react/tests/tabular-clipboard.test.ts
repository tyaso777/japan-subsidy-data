// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseTabularClipboard, serializeTabularClipboard } from '../src/domain/tabular-clipboard';

describe('Excel互換の表クリップボード', () => {
  it('タブと改行を表として読み、カンマ・通貨記号・%を数値化する', () => {
    expect(parseTabularClipboard('1,200\t5%\n￥ 3\t')).toEqual([
      [1_200, 5],
      [3, null],
    ]);
  });

  it('括弧付き数値をマイナスとし、不正値は貼り付け対象外にする', () => {
    expect(parseTabularClipboard('(12.5)\tabc')).toEqual([[-12.5, null]]);
  });

  it('選択範囲を装飾のないTSVとして書き出す', () => {
    expect(serializeTabularClipboard([[180, 195], [210, 225]])).toBe('180\t195\n210\t225');
  });

  it('科目番号・科目名と数値を同じTSVへ書き出す', () => {
    expect(serializeTabularClipboard([['1-1', '資産総額', 1050, 1115, 1185]])).toBe('1-1\t資産総額\t1050\t1115\t1185');
  });
});
