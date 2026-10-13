import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Caja, Esquina } from '../../lib/trazoGeometria';

/** Separacion (px) entre el borde visible del trazo y la caja. */
const HOLGURA_PX = 6;

const ESQUINAS: { esquina: Esquina; clase: string; cursor: string }[] = [
  { esquina: 'no', clase: '-left-1.5 -top-1.5', cursor: 'nwse-resize' },
  { esquina: 'ne', clase: '-right-1.5 -top-1.5', cursor: 'nesw-resize' },
  { esquina: 'so', clase: '-left-1.5 -bottom-1.5', cursor: 'nesw-resize' },
  { esquina: 'se', clase: '-right-1.5 -bottom-1.5', cursor: 'nwse-resize' },
];

interface Props {
  caja: Caja;
  /** Caja propia: con esquinas para escalar y cuerpo para mover. Ajena: solo se muestra, bloqueada. */
  editable: boolean;
  etiqueta?: string;
  /** Ancho (px) con el que se pinta el trazo: la caja rodea la linea completa, no solo su centro. */
  anchoLineaPx?: number;
  onIniciarEscala?: (esquina: Esquina, e: ReactPointerEvent<HTMLElement>) => void;
  onIniciarMover?: (e: ReactPointerEvent<HTMLElement>) => void;
}

export function CajaSeleccion({ caja, editable, etiqueta, anchoLineaPx = 0, onIniciarEscala, onIniciarMover }: Props) {
  const margenPx = anchoLineaPx / 2 + HOLGURA_PX;
  const estilo = {
    left: `calc(${caja.minX * 100}% - ${margenPx}px)`,
    top: `calc(${caja.minY * 100}% - ${margenPx}px)`,
    width: `calc(${(caja.maxX - caja.minX) * 100}% + ${margenPx * 2}px)`,
    height: `calc(${(caja.maxY - caja.minY) * 100}% + ${margenPx * 2}px)`,
  };

  return (
    <div
      className={
        editable
          ? 'absolute z-20 rounded-sm border-2 border-dashed border-violet bg-violet/5 cursor-move touch-none'
          : 'pointer-events-none absolute z-20 rounded-sm border-2 border-dashed border-coral/80 bg-coral/5'
      }
      style={estilo}
      onPointerDown={editable ? (e) => onIniciarMover?.(e) : undefined}
    >
      {etiqueta && (
        <span
          className={`absolute -top-6 left-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow ${
            editable ? 'bg-violet' : 'bg-coral'
          }`}
        >
          {etiqueta}
        </span>
      )}
      {editable &&
        ESQUINAS.map(({ esquina, clase, cursor }) => (
          <span
            key={esquina}
            role="presentation"
            className={`absolute h-3 w-3 rounded-[3px] border-2 border-violet bg-white shadow ${clase}`}
            style={{ cursor }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onIniciarEscala?.(esquina, e);
            }}
          />
        ))}
    </div>
  );
}
