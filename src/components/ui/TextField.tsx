import { type InputHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  ayuda?: string;
  /** 'light' para usar sobre las páginas públicas con fondo claro (login/registro/landing). */
  variant?: 'dark' | 'light';
}

export const TextField = forwardRef<HTMLInputElement, Props>(
  ({ label, error, ayuda, className, id, variant = 'dark', ...resto }, ref) => {
    const inputId = id ?? resto.name;
    const clara = variant === 'light';
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className={clara ? 'label-light' : 'label'}>
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={clsx(
            clara ? 'input-light' : 'input',
            error && (clara ? 'border-coral-dark focus:border-coral-dark focus:ring-coral-dark' : 'border-coral focus:border-coral focus:ring-coral'),
            className,
          )}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...resto}
        />
        {error && (
          <p id={`${inputId}-error`} className={clsx('text-xs', clara ? 'text-coral-dark' : 'text-coral-light')}>
            {error}
          </p>
        )}
        {!error && ayuda && <p className={clsx('text-xs', clara ? 'text-ink-950/50' : 'text-paper-dim')}>{ayuda}</p>}
      </div>
    );
  },
);
TextField.displayName = 'TextField';
