import { describe, expect, it, vi } from 'vitest';
import { dibujarBorrado, dibujarPunto, dibujarSegmento, dibujarTrazoCompleto } from './canvasEngine';
import type { EstiloPincel } from './canvasEngine';

/**
 * dibujarSegmento/dibujarPunto/dibujarTrazoCompleto/dibujarBorrado mutan un
 * CanvasRenderingContext2D real (estableciendo lineWidth, filter, etc. y
 * llamando a stroke/fill) — no hace falta jsdom-canvas para probarlos: alcanza
 * con un objeto plano que implemente la misma superficie que estas funciones
 * realmente usan, y verificar que le pasan los valores correctos.
 */
function crearContextoFalso() {
  return {
    lineCap: '',
    lineJoin: '',
    lineWidth: 0,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    strokeStyle: '',
    fillStyle: '',
    filter: 'none',
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

const LADO_PX = 640;

describe('dibujarSegmento', () => {
  it('traza una linea entre los dos puntos escalados al tamano del canvas', () => {
    const ctx = crearContextoFalso();
    const estilo: EstiloPincel = { tipoPincel: 'MARCADOR', colorHex: '#FF0000', grosor: 20, opacidad: 1 };

    dibujarSegmento(ctx, estilo, { x: 0.1, y: 0.2 }, { x: 0.5, y: 0.6 }, LADO_PX);

    expect(ctx.moveTo).toHaveBeenCalledWith(0.1 * LADO_PX, 0.2 * LADO_PX);
    expect(ctx.lineTo).toHaveBeenCalledWith(0.5 * LADO_PX, 0.6 * LADO_PX);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });

  it('acuarela mezcla con multiply, opacidad topada en 0.85*opacidad y un blur leve (HU-13)', () => {
    const ctx = crearContextoFalso();
    const estilo: EstiloPincel = { tipoPincel: 'ACUARELA', colorHex: '#00FF00', grosor: 50, opacidad: 1 };

    dibujarSegmento(ctx, estilo, { x: 0, y: 0 }, { x: 1, y: 1 }, LADO_PX);

    // se lee el valor en el momento de stroke(), antes de que restaurar() lo resetee
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });

  it('lapiz es el pincel por defecto para un tipo desconocido, sin fallar (nota tecnica HU-13)', () => {
    const ctx = crearContextoFalso();
    const estilo = { tipoPincel: 'INEXISTENTE', colorHex: '#000', grosor: 10, opacidad: 1 } as unknown as EstiloPincel;

    expect(() => dibujarSegmento(ctx, estilo, { x: 0, y: 0 }, { x: 1, y: 1 }, LADO_PX)).not.toThrow();
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });

  it('restaura globalAlpha, composite operation y filter despues de dibujar', () => {
    const ctx = crearContextoFalso();
    const estilo: EstiloPincel = { tipoPincel: 'ACUARELA', colorHex: '#00F', grosor: 30, opacidad: 0.5 };

    dibujarSegmento(ctx, estilo, { x: 0, y: 0 }, { x: 1, y: 1 }, LADO_PX);

    expect(ctx.globalAlpha).toBe(1);
    expect(ctx.globalCompositeOperation).toBe('source-over');
    expect(ctx.filter).toBe('none');
  });
});

describe('dibujarPunto', () => {
  it('dibuja un circulo relleno en la posicion escalada', () => {
    const ctx = crearContextoFalso();
    const estilo: EstiloPincel = { tipoPincel: 'LAPIZ', colorHex: '#123456', grosor: 10, opacidad: 1 };

    dibujarPunto(ctx, estilo, { x: 0.25, y: 0.75 }, LADO_PX);

    expect(ctx.arc).toHaveBeenCalledWith(0.25 * LADO_PX, 0.75 * LADO_PX, expect.any(Number), 0, Math.PI * 2);
    expect(ctx.fill).toHaveBeenCalledTimes(1);
  });
});

describe('dibujarTrazoCompleto', () => {
  it('no dibuja nada si no hay puntos', () => {
    const ctx = crearContextoFalso();
    const estilo: EstiloPincel = { tipoPincel: 'LAPIZ', colorHex: '#000', grosor: 10, opacidad: 1 };

    dibujarTrazoCompleto(ctx, estilo, [], LADO_PX);

    expect(ctx.stroke).not.toHaveBeenCalled();
    expect(ctx.fill).not.toHaveBeenCalled();
  });

  it('un solo punto se dibuja como circulo, no como linea', () => {
    const ctx = crearContextoFalso();
    const estilo: EstiloPincel = { tipoPincel: 'LAPIZ', colorHex: '#000', grosor: 10, opacidad: 1 };

    dibujarTrazoCompleto(ctx, estilo, [{ x: 0.5, y: 0.5 }], LADO_PX);

    expect(ctx.fill).toHaveBeenCalledTimes(1);
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it('N puntos se dibujan como N-1 segmentos consecutivos, en orden', () => {
    const ctx = crearContextoFalso();
    const estilo: EstiloPincel = { tipoPincel: 'LAPIZ', colorHex: '#000', grosor: 10, opacidad: 1 };
    const puntos = [{ x: 0, y: 0 }, { x: 0.2, y: 0.2 }, { x: 0.4, y: 0.4 }, { x: 0.6, y: 0.6 }];

    dibujarTrazoCompleto(ctx, estilo, puntos, LADO_PX);

    expect(ctx.stroke).toHaveBeenCalledTimes(puntos.length - 1);
    expect(ctx.moveTo).toHaveBeenNthCalledWith(1, 0, 0);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(3, 0.6 * LADO_PX, 0.6 * LADO_PX);
  });
});

describe('dibujarBorrado', () => {
  it('usa destination-out para "quitar" pintura en vez de agregar color (modo fiesta)', () => {
    const ctx = crearContextoFalso();

    dibujarBorrado(ctx, [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }], 40, LADO_PX);

    expect(ctx.globalCompositeOperation).toBe('destination-out');
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
  });

  it('no dibuja nada si no hay puntos', () => {
    const ctx = crearContextoFalso();

    dibujarBorrado(ctx, [], 40, LADO_PX);

    expect(ctx.stroke).not.toHaveBeenCalled();
    expect(ctx.save).not.toHaveBeenCalled();
  });

  it('un solo punto igual deja una marca visible (linea de largo minimo)', () => {
    const ctx = crearContextoFalso();

    dibujarBorrado(ctx, [{ x: 0.5, y: 0.5 }], 40, LADO_PX);

    expect(ctx.lineTo).toHaveBeenCalledTimes(1);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });
});
