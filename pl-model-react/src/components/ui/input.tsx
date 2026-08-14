import type { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export function Input({ className, type = 'text', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input data-slot="input" type={type} className={cn('h-9 w-full rounded-md border border-line bg-white px-3 text-sm text-ink tabular-nums outline-none transition-shadow focus-visible:border-teal focus-visible:ring-2 focus-visible:ring-teal/20 read-only:bg-soft read-only:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60', className)} {...props} />;
}
