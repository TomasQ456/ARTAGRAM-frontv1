import { describe, expect, it } from 'vitest';
import { anclaOpuesta, cajaDe, distanciaAlTrazoPx, escalar, esquinaDe, factorDeEscala, mover } from './trazoGeometria';

const TRAZO = [
  { x: 0.2, y: 0.2 },
  { x: 0.4, y: 0.3 },
  { x: 0.3, y: 0.4 },
];

describe('trazoGeometria', () => {
  it('calcula la caja que rodea al trazo', () => {
    expect(cajaDe(TRAZO)).toEqual({ minX: 0.2, minY: 0.2, maxX: 0.4, maxY: 0.4 });
  });

  it('al arrastrar una esquina, la opuesta queda fija', () => {
    const caja = cajaDe(TRAZO);
    expect(anclaOpuesta(caja, 'se')).toEqual({ x: 0.2, y: 0.2 });
    expect(anclaOpuesta(caja, 'no')).toEqual({ x: 0.4, y: 0.4 });
    expect(esquinaDe(caja, 'ne')).toEqual({ x: 0.4, y: 0.2 });
  });

  it('duplicar la distancia al ancla duplica el tamano, de forma proporcional', () => {
    const ancla = { x: 0.2, y: 0.2 };
    const factor = factorDeEscala(ancla, { x: 0.4, y: 0.4 }, { x: 0.6, y: 0.6 }, 1000, 1000);
    expect(factor).toBeCloseTo(2);
    const grande = escalar(TRAZO, ancla, factor, 1000, 1000);
    expect(cajaDe(grande)).toEqual({ minX: 0.2, minY: 0.2, maxX: 0.6, maxY: 0.6 });
  });

  it('achica el trazo sin mover el ancla', () => {
    const chico = escalar(TRAZO, { x: 0.2, y: 0.2 }, 0.5, 1000, 1000);
    expect(cajaDe(chico)).toEqual({ minX: 0.2, minY: 0.2, maxX: 0.3, maxY: 0.3 });
  });

  it('no deja que el trazo escalado se salga del lienzo', () => {
    const enorme = escalar(TRAZO, { x: 0.2, y: 0.2 }, 50, 1000, 1000);
    const caja = cajaDe(enorme);
    expect(caja.maxX).toBeLessThanOrEqual(1);
    expect(caja.maxY).toBeLessThanOrEqual(1);
    expect(caja.minX).toBeCloseTo(0.2);
  });

  it('no deja achicar el trazo por debajo de unos pocos pixeles', () => {
    const minimo = escalar(TRAZO, { x: 0.2, y: 0.2 }, 0, 1000, 1000);
    const caja = cajaDe(minimo);
    expect((caja.maxX - caja.minX) * 1000).toBeCloseTo(6);
  });

  it('mover respeta los bordes del lienzo', () => {
    const movido = mover(TRAZO, 0.9, -0.9);
    expect(cajaDe(movido)).toEqual({ minX: 0.8, minY: 0, maxX: 1, maxY: 0.2 });
  });

  it('mide la cercania del clic contra los segmentos, no solo contra los puntos', () => {
    const linea = [
      { x: 0, y: 0.5 },
      { x: 1, y: 0.5 },
    ];
    // A mitad de la linea no hay ningun punto, pero el clic esta encima del segmento
    expect(distanciaAlTrazoPx(linea, { x: 0.5, y: 0.51 }, 1000, 1000)).toBeCloseTo(10);
  });
});
