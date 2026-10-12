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
function aplicarEstilo(ctx: CanvasRenderingContext2D, estilo: EstiloPincel, ladoPx: number) {
  const grosorPx = (estilo.grosor / 100) * ladoPx * 0.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (estilo.tipoPincel) {
    case 'ACUARELA':
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = Math.min(0.85, estilo.opacidad * 0.8);
      ctx.lineWidth = grosorPx * 1.6;
      ctx.strokeStyle = estilo.colorHex;
      ctx.filter = 'blur(0.6px)';
      break;
    case 'MARCADOR':
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = estilo.opacidad;
      ctx.lineWidth = grosorPx * 1.15;
      ctx.strokeStyle = estilo.colorHex;
      ctx.filter = 'none';
      break;
    case 'LAPIZ':
    default:
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = estilo.opacidad;
      ctx.lineWidth = Math.max(1, grosorPx * 0.5);
      ctx.strokeStyle = estilo.colorHex;
      ctx.filter = 'none';
      break;
  }
}

function restaurar(ctx: CanvasRenderingContext2D) {
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
}

export function dibujarSegmento(
  ctx: CanvasRenderingContext2D,
  estilo: EstiloPincel,
  desde: Punto,
  hasta: Punto,
  ladoPx: number,
) {
  aplicarEstilo(ctx, estilo, ladoPx);
  ctx.beginPath();
  ctx.moveTo(desde.x * ladoPx, desde.y * ladoPx);
  ctx.lineTo(hasta.x * ladoPx, hasta.y * ladoPx);
  ctx.stroke();
  restaurar(ctx);
}

export function dibujarPunto(ctx: CanvasRenderingContext2D, estilo: EstiloPincel, punto: Punto, ladoPx: number) {
  aplicarEstilo(ctx, estilo, ladoPx);
  const radio = ctx.lineWidth / 2;
  ctx.beginPath();
  ctx.arc(punto.x * ladoPx, punto.y * ladoPx, radio, 0, Math.PI * 2);
  ctx.fillStyle = estilo.colorHex;
  ctx.fill();
  restaurar(ctx);
}

export function dibujarTrazoCompleto(ctx: CanvasRenderingContext2D, estilo: EstiloPincel, puntos: Punto[], ladoPx: number) {
  if (puntos.length === 0) return;
  if (puntos.length === 1) {
    dibujarPunto(ctx, estilo, puntos[0], ladoPx);
    return;
  }
  for (let i = 0; i < puntos.length - 1; i++) {
    dibujarSegmento(ctx, estilo, puntos[i], puntos[i + 1], ladoPx);
  }
}

/** Borrador del modo fiesta: "quita" pintura en vez de agregar color. */
export function dibujarBorrado(ctx: CanvasRenderingContext2D, puntos: Punto[], grosor: number, ladoPx: number) {
  if (puntos.length === 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = (grosor / 100) * ladoPx * 0.9;
  ctx.beginPath();
  ctx.moveTo(puntos[0].x * ladoPx, puntos[0].y * ladoPx);
  for (const p of puntos.slice(1)) {
    ctx.lineTo(p.x * ladoPx, p.y * ladoPx);
  }
  if (puntos.length === 1) {
    ctx.lineTo(puntos[0].x * ladoPx + 0.1, puntos[0].y * ladoPx);
  }
  ctx.stroke();
  ctx.restore();
}
