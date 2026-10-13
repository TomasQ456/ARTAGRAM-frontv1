import type { Punto, TipoPincel } from '../types';

export const LADO_LOGICO = 1000;

export interface EstiloPincel {
  tipoPincel: TipoPincel;
  colorHex: string;
  grosor: number;
  opacidad: number;
}

/**
 * Cada pincel tiene una textura distinta (HU-13): lapiz es fino y solido,
 * marcador es plano con los bordes definidos, acuarela mezcla con las capas
 * de abajo (multiply) y se ve mas suave. Un pincel desconocido (version
 * vieja del catalogo) cae al basico en vez de fallar (nota tecnica de HU-13).
 */
/** Ancho real (px) con el que se pinta la linea de cada pincel; tambien lo usa la caja de seleccion. */
export function anchoDeLineaPx(estilo: EstiloPincel, escalaPx: number): number {
  const grosorPx = (estilo.grosor / 100) * escalaPx * 0.6;
  switch (estilo.tipoPincel) {
    case 'ACUARELA':
      return Math.max(2, grosorPx * 1.5);
    case 'MARCADOR':
      return Math.max(2, grosorPx * 1.2);
    case 'PLUMA':
      return Math.max(1, grosorPx * 0.35);
    case 'AEROGRAFO':
      return Math.max(3, grosorPx * 1.8);
    case 'LAPIZ':
    default:
      return Math.max(1.2, grosorPx * 0.5);
  }
}

function aplicarEstilo(ctx: CanvasRenderingContext2D, estilo: EstiloPincel, escalaPx: number) {
  const grosorPx = (estilo.grosor / 100) * escalaPx * 0.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = anchoDeLineaPx(estilo, escalaPx);

  switch (estilo.tipoPincel) {
    case 'ACUARELA':
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = Math.min(0.75, estilo.opacidad * 0.7);
      ctx.strokeStyle = estilo.colorHex;
      break;
    case 'MARCADOR':
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = Math.min(0.9, estilo.opacidad);
      ctx.strokeStyle = estilo.colorHex;
      break;
    case 'PLUMA':
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = estilo.opacidad;
      ctx.strokeStyle = estilo.colorHex;
      break;
    case 'AEROGRAFO':
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = Math.min(0.55, estilo.opacidad * 0.45);
      ctx.strokeStyle = estilo.colorHex;
      ctx.shadowColor = estilo.colorHex;
      ctx.shadowBlur = Math.max(4, grosorPx * 0.8);
      break;
    case 'LAPIZ':
    default:
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = estilo.opacidad;
      ctx.strokeStyle = estilo.colorHex;
      break;
  }
}

function restaurar(ctx: CanvasRenderingContext2D) {
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  if (ctx.filter && ctx.filter !== 'none') {
    ctx.filter = 'none';
  }
}

export function dibujarSegmento(
  ctx: CanvasRenderingContext2D,
  estilo: EstiloPincel,
  desde: Punto,
  hasta: Punto,
  anchoPx: number,
  altoPx: number = anchoPx,
) {
  const escala = Math.min(anchoPx, altoPx);
  aplicarEstilo(ctx, estilo, escala);
  ctx.beginPath();
  ctx.moveTo(desde.x * anchoPx, desde.y * altoPx);
  ctx.lineTo(hasta.x * anchoPx, hasta.y * altoPx);
  ctx.stroke();
  restaurar(ctx);
}

export function dibujarPunto(
  ctx: CanvasRenderingContext2D,
  estilo: EstiloPincel,
  punto: Punto,
  anchoPx: number,
  altoPx: number = anchoPx,
) {
  const escala = Math.min(anchoPx, altoPx);
  aplicarEstilo(ctx, estilo, escala);
  const radio = Math.max(1, ctx.lineWidth / 2);
  ctx.beginPath();
  ctx.arc(punto.x * anchoPx, punto.y * altoPx, radio, 0, Math.PI * 2);
  ctx.fillStyle = estilo.colorHex;
  ctx.fill();
  restaurar(ctx);
}

export function dibujarTrazoCompleto(
  ctx: CanvasRenderingContext2D,
  estilo: EstiloPincel,
  puntos: Punto[],
  anchoPx: number,
  altoPx: number = anchoPx,
) {
  if (puntos.length === 0) return;
  if (puntos.length === 1) {
    dibujarPunto(ctx, estilo, puntos[0], anchoPx, altoPx);
    return;
  }
  const escala = Math.min(anchoPx, altoPx);
  aplicarEstilo(ctx, estilo, escala);
  ctx.beginPath();
  ctx.moveTo(puntos[0].x * anchoPx, puntos[0].y * altoPx);
  for (let i = 1; i < puntos.length; i++) {
    ctx.lineTo(puntos[i].x * anchoPx, puntos[i].y * altoPx);
  }
  ctx.stroke();
  restaurar(ctx);
}

/** Borrador del modo fiesta: "quita" pintura en vez de agregar color. */
export function dibujarBorrado(
  ctx: CanvasRenderingContext2D,
  puntos: Punto[],
  grosor: number,
  anchoPx: number,
  altoPx: number = anchoPx,
) {
  if (puntos.length === 0) return;
  const escala = Math.min(anchoPx, altoPx);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = (grosor / 100) * escala * 0.9;
  ctx.beginPath();
  ctx.moveTo(puntos[0].x * anchoPx, puntos[0].y * altoPx);
  for (const p of puntos.slice(1)) {
    ctx.lineTo(p.x * anchoPx, p.y * altoPx);
  }
  if (puntos.length === 1) {
    ctx.lineTo(puntos[0].x * anchoPx + 0.1, puntos[0].y * altoPx);
  }
  ctx.stroke();
  ctx.restore();
}
