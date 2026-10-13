import type { Punto } from '../types';

/**
 * Geometria de la caja de seleccion del lienzo. Todo trabaja en coordenadas
 * normalizadas (0..1), igual que los puntos que viajan al backend; los
 * calculos que dependen de distancias reales (escala, cercania al clic) pasan
 * por pixeles para que se sientan igual en un lienzo ancho o alto.
 */

export interface Caja {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type Esquina = 'no' | 'ne' | 'so' | 'se';

/** Tamano minimo (en px) al que se puede achicar un trazo, para no perderlo de vista. */
const LADO_MINIMO_PX = 6;

export function cajaDe(puntos: Punto[]): Caja {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const p of puntos) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

/** La esquina opuesta a la que se arrastra queda fija mientras se escala. */
export function anclaOpuesta(caja: Caja, esquina: Esquina): Punto {
  return {
    x: esquina === 'no' || esquina === 'so' ? caja.maxX : caja.minX,
    y: esquina === 'no' || esquina === 'ne' ? caja.maxY : caja.minY,
  };
}

export function esquinaDe(caja: Caja, esquina: Esquina): Punto {
  return {
    x: esquina === 'no' || esquina === 'so' ? caja.minX : caja.maxX,
    y: esquina === 'no' || esquina === 'ne' ? caja.minY : caja.maxY,
  };
}

/**
 * Factor de escala proporcional al arrastrar una esquina: la distancia (en px)
 * del ancla al puntero, comparada con la del ancla a la esquina original.
 * Usar la distancia y no el ancho/alto por separado funciona tambien con
 * trazos rectos (caja de alto o ancho cero).
 */
export function factorDeEscala(ancla: Punto, esquinaOriginal: Punto, puntero: Punto, anchoPx: number, altoPx: number): number {
  const original = Math.hypot((esquinaOriginal.x - ancla.x) * anchoPx, (esquinaOriginal.y - ancla.y) * altoPx);
  if (original < 1e-6) return 1;
  const actual = Math.hypot((puntero.x - ancla.x) * anchoPx, (puntero.y - ancla.y) * altoPx);
  return actual / original;
}

/**
 * Escala los puntos respecto al ancla, limitando el factor para que el trazo no
 * se salga del lienzo ni quede mas chico que LADO_MINIMO_PX.
 */
export function escalar(puntos: Punto[], ancla: Punto, factor: number, anchoPx: number, altoPx: number): Punto[] {
  const caja = cajaDe(puntos);
  const ladoPx = Math.max((caja.maxX - caja.minX) * anchoPx, (caja.maxY - caja.minY) * altoPx);
  const minimo = ladoPx > 0 ? Math.min(1, LADO_MINIMO_PX / ladoPx) : 1;

  let maximo = Infinity;
  for (const p of puntos) {
    const dx = p.x - ancla.x;
    const dy = p.y - ancla.y;
    if (dx > 1e-9) maximo = Math.min(maximo, (1 - ancla.x) / dx);
    if (dx < -1e-9) maximo = Math.min(maximo, ancla.x / -dx);
    if (dy > 1e-9) maximo = Math.min(maximo, (1 - ancla.y) / dy);
    if (dy < -1e-9) maximo = Math.min(maximo, ancla.y / -dy);
  }

  const s = Math.min(maximo, Math.max(minimo, factor));
  return puntos.map((p) => ({
    x: redondear(ancla.x + (p.x - ancla.x) * s),
    y: redondear(ancla.y + (p.y - ancla.y) * s),
  }));
}

/** Desplaza los puntos sin dejar que ninguno salga del lienzo. */
export function mover(puntos: Punto[], dx: number, dy: number): Punto[] {
  const caja = cajaDe(puntos);
  const ddx = Math.min(1 - caja.maxX, Math.max(-caja.minX, dx));
  const ddy = Math.min(1 - caja.maxY, Math.max(-caja.minY, dy));
  return puntos.map((p) => ({ x: redondear(p.x + ddx), y: redondear(p.y + ddy) }));
}

/**
 * Distancia en px del clic al trazo, midiendo contra cada segmento (no solo
 * contra los puntos), para poder seleccionar trazos largos con pocos puntos.
 */
export function distanciaAlTrazoPx(puntos: Punto[], clic: Punto, anchoPx: number, altoPx: number): number {
  if (puntos.length === 0) return Infinity;
  const cx = clic.x * anchoPx;
  const cy = clic.y * altoPx;
  if (puntos.length === 1) {
    return Math.hypot(puntos[0].x * anchoPx - cx, puntos[0].y * altoPx - cy);
  }
  let mejor = Infinity;
  for (let i = 1; i < puntos.length; i++) {
    const ax = puntos[i - 1].x * anchoPx;
    const ay = puntos[i - 1].y * altoPx;
    const bx = puntos[i].x * anchoPx;
    const by = puntos[i].y * altoPx;
    const largo2 = (bx - ax) ** 2 + (by - ay) ** 2;
    const t = largo2 === 0 ? 0 : Math.max(0, Math.min(1, ((cx - ax) * (bx - ax) + (cy - ay) * (by - ay)) / largo2));
    mejor = Math.min(mejor, Math.hypot(ax + t * (bx - ax) - cx, ay + t * (by - ay) - cy));
  }
  return mejor;
}

function redondear(v: number): number {
  return Math.round(v * 10000) / 10000;
}
