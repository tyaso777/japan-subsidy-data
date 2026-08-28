import { useEffect, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { Input } from './input';

export type NumberInputProps = Omit<ComponentProps<typeof Input>, 'type' | 'value' | 'onChange' | 'onFocus' | 'onBlur'> & {
  value: number | null | undefined;
  onValueChange: (value: number) => void;
  emptyValue?: number | null;
  onEmptyChange?: () => void;
  onEmpty?: () => void;
  onEditingStart?: () => void;
  onEditingEnd?: () => void;
  commitOnBlur?: boolean;
};

/** 入力中だけ空文字を許し、空欄のまま確定したときに既定値（通常0）を補完する数値入力。 */
export function NumberInput({ value, onValueChange, emptyValue = 0, onEmptyChange, onEmpty, onEditingStart, onEditingEnd, commitOnBlur = false, onKeyDown, ...props }: NumberInputProps) {
  const normalizedValue = Number.isFinite(value) ? Number(value) : emptyValue;
  const [draft, setDraft] = useState(normalizedValue === null ? '' : String(normalizedValue));
  const [editing, setEditing] = useState(false);
  const latestValue = useRef(normalizedValue);
  latestValue.current = normalizedValue;

  useEffect(() => {
    if (!editing) setDraft(normalizedValue === null ? '' : String(normalizedValue));
  }, [editing, normalizedValue]);

  const finishEditing = () => {
    const trimmed = draft.trim();
    if (trimmed === '' && emptyValue === null) {
      setDraft('');
      setEditing(false);
      onEmpty?.();
      onEditingEnd?.();
      return;
    }
    const parsed = trimmed === '' ? Number(emptyValue) : Number(trimmed);
    const committed = Number.isFinite(parsed) ? parsed : (latestValue.current ?? 0);
    setDraft(String(committed));
    setEditing(false);
    if (committed !== latestValue.current || trimmed === '') onValueChange(committed);
    onEditingEnd?.();
  };

  return <Input
    {...props}
    type="number"
    value={draft}
    onFocus={() => {
      setEditing(true);
      onEditingStart?.();
    }}
    onChange={(event) => {
      const nextDraft = event.target.value;
      setDraft(nextDraft);
      if (nextDraft.trim() === '') {
        onEmptyChange?.();
        return;
      }
      if (commitOnBlur) return;
      const parsed = Number(nextDraft);
      if (Number.isFinite(parsed)) onValueChange(parsed);
    }}
    onBlur={finishEditing}
    onKeyDown={(event) => {
      onKeyDown?.(event);
      if (!event.defaultPrevented && event.key === 'Enter') event.currentTarget.blur();
    }}
  />;
}
