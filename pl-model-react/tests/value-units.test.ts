import { describe, expect, it } from 'vitest';
import { financialInputFractionDigits, formatFinancialValue, fromDisplayMoney, moneyUnitLabel, roundFinancialInputValue, toDisplayMoney } from '../src/domain/value-units';

describe('金額単位と表示精度', () => {
  it('内部の円を各表示単位へ変換し、元の円へ戻す', () => {
    const yen = 900_000_000;
    expect(toDisplayMoney(yen, 'yen')).toBe(900_000_000);
    expect(toDisplayMoney(yen, 'thousandYen')).toBe(900_000);
    expect(toDisplayMoney(yen, 'millionYen')).toBe(900);
    expect(toDisplayMoney(yen, 'hundredMillionYen')).toBe(9);
    expect(fromDisplayMoney(9, 'hundredMillionYen')).toBe(yen);
  });

  it('計算値は丸めず、表示時だけ指定桁で丸める', () => {
    const precise = 1_000_000 / 3;
    expect(precise).not.toBe(333_333);
    expect(formatFinancialValue(precise, 'money', 'yen')).toBe('333,333.33');
    expect(formatFinancialValue(132_000_000 / 118, 'moneyPerPerson', 'yen')).toBe('1,118,644.07 円/人');
  });

  it('表示単位の日本語名称を返す', () => {
    expect(moneyUnitLabel('yen')).toBe('円');
    expect(moneyUnitLabel('thousandYen')).toBe('千円');
    expect(moneyUnitLabel('millionYen')).toBe('百万円');
    expect(moneyUnitLabel('hundredMillionYen')).toBe('億円');
  });

  it('P/L入力欄は内部精度を変えずに表示値だけ適切な桁へ丸める', () => {
    expect(financialInputFractionDigits('money', 'yen')).toBe(0);
    expect(financialInputFractionDigits('money', 'millionYen')).toBe(1);
    expect(financialInputFractionDigits('money', 'hundredMillionYen')).toBe(2);
    expect(financialInputFractionDigits('percent', 'millionYen')).toBe(2);
    expect(roundFinancialInputValue(1_360.48896, 'money', 'millionYen')).toBe(1_360.5);
    expect(roundFinancialInputValue(5.5555, 'percent', 'millionYen')).toBe(5.56);
  });
});
