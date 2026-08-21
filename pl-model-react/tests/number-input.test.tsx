import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NumberInput } from '../src/components/ui/number-input';

function ControlledNumberInput({ onChange }: { onChange: (value: number) => void }) {
  const [value, setValue] = useState(50);
  return <NumberInput aria-label="数値" value={value} onValueChange={(next) => { setValue(next); onChange(next); }} />;
}

function ControlledOptionalNumberInput({ onChange }: { onChange: (value: number | null) => void }) {
  const [value, setValue] = useState<number | null>(null);
  return <NumberInput
    aria-label="任意数値"
    placeholder="現在予測 88.94%"
    value={value}
    emptyValue={null}
    onEmpty={() => { setValue(null); onChange(null); }}
    onValueChange={(next) => { setValue(next); onChange(next); }}
  />;
}

describe('共通数値入力', () => {
  it('編集中は空欄を維持し、続けて入力した数字へ置き換える', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledNumberInput onChange={onChange} />);
    const input = screen.getByRole('spinbutton', { name: '数値' });

    await user.clear(input);
    expect(input).toHaveValue(null);
    expect(onChange).not.toHaveBeenCalled();
    await user.type(input, '50');
    expect(input).toHaveValue(50);
    expect(onChange).toHaveBeenLastCalledWith(50);
  });

  it('空欄のまま確定した場合だけ0を補完する', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledNumberInput onChange={onChange} />);
    const input = screen.getByRole('spinbutton', { name: '数値' });

    await user.clear(input);
    await user.tab();
    expect(input).toHaveValue(0);
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it('任意入力では未設定を空欄で保ち、数値入力後も空欄へ戻して解除できる', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledOptionalNumberInput onChange={onChange} />);
    const input = screen.getByRole('spinbutton', { name: '任意数値' });

    expect(input).toHaveValue(null);
    expect(input).toHaveAttribute('placeholder', '現在予測 88.94%');
    await user.type(input, '65');
    expect(input).toHaveValue(65);
    expect(onChange).toHaveBeenLastCalledWith(65);

    await user.clear(input);
    await user.tab();
    expect(input).toHaveValue(null);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
