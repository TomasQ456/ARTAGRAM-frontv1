import clsx from 'clsx';
import type { TipoPincel } from '../../types';

const PINCELES: { valor: TipoPincel; etiqueta: string; icono: string }[] = [
  { valor: 'LAPIZ', etiqueta: 'Lápiz', icono: '✎' },
  { valor: 'MARCADOR', etiqueta: 'Marcador', icono: '🖊' },
  { valor: 'ACUARELA', etiqueta: 'Acuarela', icono: '🖌' },
];

const PALETA = ['#F5F1EA', '#FF6B57', '#FFC24B', '#2FD9C4', '#8B5CF6', '#3A86FF', '#0B0912', '#2A9D8F'];

export interface Herramienta {
  tipoPincel: TipoPincel;
  colorHex: string;
  grosor: number;
  opacidad: number;
}

export function BrushToolbar({
  herramienta,
  onCambiar,
  modoEdicion,
  onToggleEdicion,
  deshabilitado,
}: {
  herramienta: Herramienta;
  onCambiar: (h: Herramienta) => void;
  modoEdicion: boolean;
  onToggleEdicion: () => void;
  deshabilitado?: boolean;
}) {
  return (
    <div className={clsx('card flex flex-col gap-4 p-4', deshabilitado && 'opacity-50 pointer-events-none')}>
      <div>
        <p className="label mb-2">Pincel</p>
        <div className="flex gap-1.5">
          {PINCELES.map((p) => (
            <button
              key={p.valor}
              onClick={() => onCambiar({ ...herramienta, tipoPincel: p.valor })}
              className={clsx(
                'flex-1 rounded-xl border px-2 py-2.5 text-center text-xs font-medium transition-colors',
                herramienta.tipoPincel === p.valor
                  ? 'border-violet bg-violet/15 text-paper'
                  : 'border-ink-600 bg-ink-900/50 text-paper-muted hover:border-ink-500',
              )}
              title={p.etiqueta}
            >
              <div className="text-lg leading-none">{p.icono}</div>
              <div className="mt-1">{p.etiqueta}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="label mb-2">Color</p>
        <div className="flex flex-wrap gap-2">
          {PALETA.map((c) => (
            <button
              key={c}
              onClick={() => onCambiar({ ...herramienta, colorHex: c })}
              className={clsx(
                'h-7 w-7 rounded-full border-2 transition-transform hover:scale-110',
                herramienta.colorHex === c ? 'border-paper scale-110' : 'border-transparent',
              )}
              style={{ backgroundColor: c }}
              aria-label={`Color ${c}`}
            />
          ))}
          <input
            type="color"
            value={herramienta.colorHex}
            onChange={(e) => onCambiar({ ...herramienta, colorHex: e.target.value })}
            className="h-7 w-7 cursor-pointer rounded-full border-2 border-ink-600 bg-transparent"
            title="Elegir otro color"
          />
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="label">Grosor</p>
          <span className="text-xs text-paper-dim">{herramienta.grosor}</span>
        </div>
        <input
          type="range"
          min={1}
          max={64}
          value={herramienta.grosor}
          onChange={(e) => onCambiar({ ...herramienta, grosor: Number(e.target.value) })}
          className="w-full accent-coral"
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="label">Opacidad</p>
          <span className="text-xs text-paper-dim">{Math.round(herramienta.opacidad * 100)}%</span>
        </div>
        <input
          type="range"
          min={5}
          max={100}
          value={Math.round(herramienta.opacidad * 100)}
          onChange={(e) => onCambiar({ ...herramienta, opacidad: Number(e.target.value) / 100 })}
          className="w-full accent-coral"
        />
      </div>

      <button
        onClick={onToggleEdicion}
        className={clsx(
          'rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
          modoEdicion ? 'border-amber bg-amber/15 text-amber' : 'border-ink-600 text-paper-muted hover:border-ink-500',
        )}
      >
        {modoEdicion ? 'Editando un trazo…' : 'Editar un trazo existente'}
      </button>
    </div>
  );
}
