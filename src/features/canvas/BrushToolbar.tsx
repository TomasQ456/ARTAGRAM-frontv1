import { useState } from 'react';
import clsx from 'clsx';
import type { TipoPincel } from '../../types';

const PINCELES: { valor: TipoPincel; etiqueta: string; icono: string; descripcion: string }[] = [
  { valor: 'LAPIZ', etiqueta: 'Lápiz', icono: '✎', descripcion: 'Trazo fino y preciso' },
  { valor: 'MARCADOR', etiqueta: 'Marcador', icono: '🖊', descripcion: 'Bordes definidos y planos' },
  { valor: 'ACUARELA', etiqueta: 'Acuarela', icono: '🖌', descripcion: 'Efecto suave y traslúcido' },
  { valor: 'PLUMA', etiqueta: 'Pluma', icono: '✒', descripcion: 'Línea de tinta caligráfica' },
  { valor: 'AEROGRAFO', etiqueta: 'Spray', icono: '💨', descripcion: 'Aerógrafo difuminado' },
];

const COLORES_CLASICOS = [
  '#0B0912', // Negro
  '#F5F1EA', // Blanco marfil
  '#6B7280', // Gris neutro
  '#EF4444', // Rojo
  '#F97316', // Naranja
  '#FFC24B', // Amarillo
  '#10B981', // Verde
  '#06B6D4', // Cyan
  '#3B82F6', // Azul
  '#8B5CF6', // Púrpura
  '#EC4899', // Rosa
];

const COLORES_MATES = [
  '#D98A7D', // Rosa mate
  '#C87D55', // Terracota
  '#8E9F8B', // Verde salvia
  '#5A7A61', // Verde musgo
  '#C29B38', // Mostaza mate
  '#A2703F', // Ocre cálido
  '#5E7182', // Azul pizarra
  '#A29DB8', // Lavanda mate
  '#BDB39C', // Arena suave
  '#4A4036', // Marrón mate
  '#2E383F', // Carbón mate
];

const PRESETS_GROSOR = [4, 12, 24, 42];

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
  orientacion = 'horizontal',
  onPublicar,
}: {
  herramienta: Herramienta;
  onCambiar: (h: Herramienta) => void;
  modoEdicion: boolean;
  onToggleEdicion: () => void;
  deshabilitado?: boolean;
  orientacion?: 'horizontal' | 'vertical';
  onPublicar?: () => void;
}) {
  const [categoriaColor, setCategoriaColor] = useState<'clasicos' | 'mates'>('clasicos');

  if (orientacion === 'vertical') {
    return (
      <div className={clsx('card flex flex-col gap-4 p-4', deshabilitado && 'opacity-50 pointer-events-none')}>
        <div>
          <p className="label mb-2">Pincel</p>
          <div className="grid grid-cols-2 gap-1.5">
            {PINCELES.map((p) => (
              <button
                key={p.valor}
                type="button"
                onClick={() => onCambiar({ ...herramienta, tipoPincel: p.valor })}
                className={clsx(
                  'rounded-xl border px-2 py-2 text-center text-xs font-medium transition-colors',
                  herramienta.tipoPincel === p.valor
                    ? 'border-violet bg-violet/15 text-paper'
                    : 'border-ink-600 bg-ink-900/50 text-paper-muted hover:border-ink-500',
                )}
                title={p.descripcion}
              >
                <div className="text-base leading-none">{p.icono}</div>
                <div className="mt-1">{p.etiqueta}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="label">Color</p>
            <div className="flex gap-1 text-[11px]">
              <button
                type="button"
                onClick={() => setCategoriaColor('clasicos')}
                className={clsx('px-1.5 py-0.5 rounded', categoriaColor === 'clasicos' ? 'bg-ink-700 text-paper' : 'text-paper-dim')}
              >
                Normal
              </button>
              <button
                type="button"
                onClick={() => setCategoriaColor('mates')}
                className={clsx('px-1.5 py-0.5 rounded', categoriaColor === 'mates' ? 'bg-ink-700 text-paper' : 'text-paper-dim')}
              >
                Mate
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(categoriaColor === 'clasicos' ? COLORES_CLASICOS : COLORES_MATES).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onCambiar({ ...herramienta, colorHex: c })}
                className={clsx(
                  'h-6 w-6 rounded-full border-2 transition-transform hover:scale-110',
                  herramienta.colorHex.toLowerCase() === c.toLowerCase() ? 'border-paper scale-110 shadow-sm' : 'border-transparent',
                )}
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
              />
            ))}
            <label className="relative h-6 w-6 cursor-pointer rounded-full border-2 border-ink-600 bg-transparent flex items-center justify-center hover:border-paper" title="Elegir otro color">
              <span className="text-[10px] leading-none">🎨</span>
              <input
                type="color"
                value={herramienta.colorHex}
                onChange={(e) => onCambiar({ ...herramienta, colorHex: e.target.value })}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
            </label>
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
          type="button"
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

  // Barra Horizontal Permanente estilo Paint
  return (
    <div
      className={clsx(
        'card flex flex-wrap items-center justify-between gap-3 p-2.5 bg-ink-900/95 border-ink-800 shadow-md backdrop-blur-md rounded-2xl select-none',
        deshabilitado && 'opacity-50 pointer-events-none',
      )}
    >
      {/* Sección 1: Pinceles / Herramientas de trazo */}
      <div className="flex items-center gap-1.5 border-r border-ink-800 pr-3">
        <span className="text-[11px] font-semibold text-paper-dim uppercase tracking-wider hidden sm:inline mr-1">
          Pincel
        </span>
        <div className="flex items-center gap-1">
          {PINCELES.map((p) => (
            <button
              key={p.valor}
              type="button"
              onClick={() => onCambiar({ ...herramienta, tipoPincel: p.valor })}
              className={clsx(
                'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all',
                herramienta.tipoPincel === p.valor
                  ? 'border-violet bg-violet/20 text-paper shadow-sm'
                  : 'border-ink-700/60 bg-ink-800/40 text-paper-muted hover:border-ink-600 hover:text-paper',
              )}
              title={`${p.etiqueta}: ${p.descripcion}`}
            >
              <span className="text-sm leading-none">{p.icono}</span>
              <span className="hidden md:inline">{p.etiqueta}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Sección 2: Trazo (Grosor y Opacidad) */}
      <div className="flex items-center gap-3 border-r border-ink-800 pr-3">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center justify-between gap-2 text-[10px] text-paper-dim">
            <span>Grosor</span>
            <span className="font-mono text-paper-muted">{herramienta.grosor}px</span>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="range"
              min={1}
              max={64}
              value={herramienta.grosor}
              onChange={(e) => onCambiar({ ...herramienta, grosor: Number(e.target.value) })}
              className="w-20 md:w-24 accent-coral h-1.5 bg-ink-800 rounded-lg cursor-pointer"
              title={`Grosor: ${herramienta.grosor}px`}
            />
            <div className="hidden lg:flex items-center gap-1">
              {PRESETS_GROSOR.map((tam) => (
                <button
                  key={tam}
                  type="button"
                  onClick={() => onCambiar({ ...herramienta, grosor: tam })}
                  className={clsx(
                    'h-5 w-5 rounded border text-[10px] grid place-items-center transition-colors',
                    herramienta.grosor === tam
                      ? 'border-coral bg-coral/20 text-coral-light'
                      : 'border-ink-700 bg-ink-800/60 text-paper-dim hover:text-paper',
                  )}
                  title={`Preset ${tam}px`}
                >
                  {tam}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-0.5">
          <div className="flex items-center justify-between gap-2 text-[10px] text-paper-dim">
            <span>Opacidad</span>
            <span className="font-mono text-paper-muted">{Math.round(herramienta.opacidad * 100)}%</span>
          </div>
          <input
            type="range"
            min={5}
            max={100}
            value={Math.round(herramienta.opacidad * 100)}
            onChange={(e) => onCambiar({ ...herramienta, opacidad: Number(e.target.value) / 100 })}
            className="w-16 md:w-20 accent-coral h-1.5 bg-ink-800 rounded-lg cursor-pointer"
            title={`Opacidad: ${Math.round(herramienta.opacidad * 100)}%`}
          />
        </div>
      </div>

      {/* Sección 3: Paleta de Colores (Normales, Mates y Selector Personalizado) */}
      <div className="flex items-center gap-2 flex-1 min-w-[260px]">
        {/* Selector de categoría de paleta */}
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => setCategoriaColor('clasicos')}
            className={clsx(
              'px-2 py-0.5 rounded text-[10px] font-semibold transition-colors',
              categoriaColor === 'clasicos' ? 'bg-violet/25 text-violet border border-violet/40' : 'text-paper-dim hover:text-paper',
            )}
          >
            Clásicos
          </button>
          <button
            type="button"
            onClick={() => setCategoriaColor('mates')}
            className={clsx(
              'px-2 py-0.5 rounded text-[10px] font-semibold transition-colors',
              categoriaColor === 'mates' ? 'bg-amber/25 text-amber border border-amber/40' : 'text-paper-dim hover:text-paper',
            )}
          >
            Mates
          </button>
        </div>

        {/* Muestras de color */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(categoriaColor === 'clasicos' ? COLORES_CLASICOS : COLORES_MATES).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onCambiar({ ...herramienta, colorHex: c })}
              className={clsx(
                'h-5 w-5 md:h-6 md:w-6 rounded-full border-2 transition-all hover:scale-115',
                herramienta.colorHex.toLowerCase() === c.toLowerCase()
                  ? 'border-paper scale-115 shadow-sm ring-2 ring-violet/50'
                  : 'border-ink-700/80 hover:border-paper/60',
              )}
              style={{ backgroundColor: c }}
              title={`Color ${c}`}
            />
          ))}

          {/* Color actual y selector personalizado nativo */}
          <label
            className="relative h-6 w-6 md:h-7 md:w-7 cursor-pointer rounded-full border-2 border-dashed border-ink-500 hover:border-paper flex items-center justify-center transition-transform hover:scale-110 ml-1"
            title="Elegir cualquier color personalizado"
            style={{ backgroundColor: herramienta.colorHex }}
          >
            <span className="text-[10px] drop-shadow-md select-none">🎨</span>
            <input
              type="color"
              value={herramienta.colorHex}
              onChange={(e) => onCambiar({ ...herramienta, colorHex: e.target.value })}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
          </label>
        </div>
      </div>

      {/* Sección 4: Modo Edición y Publicar */}
      <div className="flex items-center gap-2 border-l border-ink-800 pl-3">
        <button
          type="button"
          onClick={onToggleEdicion}
          className={clsx(
            'rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5',
            modoEdicion
              ? 'border-amber bg-amber/20 text-amber shadow-sm animate-pulse'
              : 'border-ink-700 bg-ink-800/40 text-paper-muted hover:border-ink-600 hover:text-paper',
          )}
          title="Toca un trazo ya pintado para seleccionarlo y redibujarlo"
        >
          <span>🎯</span>
          <span className="hidden sm:inline">{modoEdicion ? 'Editando trazo' : 'Editar trazo'}</span>
        </button>

        {onPublicar && (
          <button
            type="button"
            onClick={onPublicar}
            className="btn-primary text-xs px-3.5 py-1.5 flex items-center gap-1.5 font-semibold shadow-md shadow-coral/25 bg-gradient-to-r from-coral to-violet hover:brightness-110 transition-all"
            title="Publicar esta obra colaborativa en el feed"
          >
            <span>🎨</span>
            <span>Publicar</span>
          </button>
        )}
      </div>
    </div>
  );
}
