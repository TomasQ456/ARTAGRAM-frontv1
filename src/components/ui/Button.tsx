import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  cargando?: boolean;
  icono?: ReactNode;
}

export function Button({ variant = 'primary', cargando, icono, className, children, disabled, ...resto }: Props) {
  const claseVariante = variant === 'primary' ? 'btn-primary' : variant === 'secondary' ? 'btn-secondary' : 'btn-ghost';
  return (
    <button className={clsx(claseVariante, className)} disabled={disabled || cargando} {...resto}>
      {cargando ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        icono
      )}
      {children}
    </button>
  );
}
