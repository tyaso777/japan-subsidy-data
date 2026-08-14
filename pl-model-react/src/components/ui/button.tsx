import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-teal/35 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-3.5',
  {
    variants: {
      variant: {
        default: 'bg-navy text-white hover:bg-navy/90',
        ghost: 'text-muted-foreground hover:bg-soft hover:text-ink',
        outline: 'border border-line bg-surface text-ink hover:bg-soft',
        subtle: 'border border-teal/30 bg-teal/5 text-teal hover:bg-teal/10',
      },
      size: {
        default: 'h-9 px-4 text-xs',
        sm: 'h-8 px-3 text-[11px]',
        xs: 'h-7 px-2.5 text-[10px]',
        icon: 'size-8 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = 'button', ...props }: Props) {
  return <button data-slot="button" type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
