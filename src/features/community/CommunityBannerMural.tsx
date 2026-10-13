import { useEffect, useRef, useState, useCallback } from 'react';
import { api, extraerMensajeError } from '../../lib/api';
import { stompService } from '../../lib/stompClient';
import { useAuthStore } from '../../lib/authStore';
import { dibujarPunto, dibujarSegmento, dibujarTrazoCompleto, dibujarBorrado, type EstiloPincel } from '../../lib/canvasEngine';
import { BrushToolbar, type Herramienta } from '../canvas/BrushToolbar';
import { Button } from '../../components/ui/Button';
import type { BannerTrazoEvento, Punto, RegionEstado, TipoPincel } from '../../types';

const REGIONES_POR_LADO = 10;
const TAMANO_REGION = 1 / REGIONES_POR_LADO;

interface Props {
  comunidadId: string;
  interactivo?: boolean;
  alturaPx?: number;
  onCerrarEdicion?: () => void;
}

export function CommunityBannerMural({ comunidadId, interactivo = false, alturaPx = 280, onCerrarEdicion }: Props) {
  const sesion = useAuthStore((s) => s.sesion);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [herramienta, setHerramienta] = useState<Herramienta>({
    tipoPincel: 'MARCADOR',
    colorHex: '#FF6B57',
    grosor: 18,
    opacidad: 0.95,
  });
  const [esBorrador, setEsBorrador] = useState(false);

  // Almacén en memoria de snapshots y trazos de las 100 regiones
  const regionesRef = useRef<Map<number, { snapshotBase64: string | null; trazos: BannerTrazoEvento[] }>>(new Map());
  const trazoActualRef = useRef<{ puntos: Punto[]; estilo: EstiloPincel; esBorrador: boolean } | null>(null);
  const dimRef = useRef<{ ancho: number; alto: number }>({ ancho: 1000, alto: 1000 });

  function regionDe(punto: Punto): number {
    const col = Math.min(REGIONES_POR_LADO - 1, Math.max(0, Math.floor(punto.x / TAMANO_REGION)));
    const fila = Math.min(REGIONES_POR_LADO - 1, Math.max(0, Math.floor(punto.y / TAMANO_REGION)));
    return fila * REGIONES_POR_LADO + col;
  }

  function aLocal(punto: Punto, regionIndex: number): Punto {
    const col = regionIndex % REGIONES_POR_LADO;
    const fila = Math.floor(regionIndex / REGIONES_POR_LADO);
    return {
      x: Math.min(1, Math.max(0, (punto.x - col * TAMANO_REGION) / TAMANO_REGION)),
      y: Math.min(1, Math.max(0, (punto.y - fila * TAMANO_REGION) / TAMANO_REGION)),
    };
  }

  function aGlobal(regionIndex: number, local: Punto): Punto {
    const col = regionIndex % REGIONES_POR_LADO;
    const fila = Math.floor(regionIndex / REGIONES_POR_LADO);
    return {
      x: col * TAMANO_REGION + local.x * TAMANO_REGION,
      y: fila * TAMANO_REGION + local.y * TAMANO_REGION,
    };
  }

  const redibujarTodo = useCallback(async () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    const { ancho, alto } = dimRef.current;

    ctx.clearRect(0, 0, ancho, alto);
    ctx.fillStyle = '#F5F1EA';
    ctx.fillRect(0, 0, ancho, alto);

    const pasoX = ancho / REGIONES_POR_LADO;
    const pasoY = alto / REGIONES_POR_LADO;

    // 1. Dibujar snapshots de regiones
    const promesas: Promise<void>[] = [];
    for (const [regionIndex, reg] of regionesRef.current.entries()) {
      if (reg.snapshotBase64) {
        const p = new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            const col = regionIndex % REGIONES_POR_LADO;
            const fila = Math.floor(regionIndex / REGIONES_POR_LADO);
            ctx.drawImage(img, col * pasoX, fila * pasoY, pasoX, pasoY);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = `data:image/png;base64,${reg.snapshotBase64}`;
        });
        promesas.push(p);
      }
    }
    await Promise.all(promesas);

    // 2. Dibujar trazos guardados desde el snapshot
    for (const [regionIndex, reg] of regionesRef.current.entries()) {
      for (const t of reg.trazos) {
        const estilo: EstiloPincel = {
          tipoPincel: (t.tipoPincel ?? 'MARCADOR') as TipoPincel,
          colorHex: t.colorHex ?? '#0B0912',
          grosor: t.grosor ?? 18,
          opacidad: t.opacidad ?? 1,
        };
        const puntosGlobales = t.puntos.map((p) => aGlobal(regionIndex, p));
        dibujarTrazoCompleto(ctx, estilo, puntosGlobales, ancho, alto);
      }
    }

    // 3. Dibujar tenue cuadrícula mural si es interactivo
    if (interactivo) {
      ctx.save();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.lineWidth = 1;
      for (let i = 1; i < REGIONES_POR_LADO; i++) {
        ctx.beginPath();
        ctx.moveTo(i * pasoX, 0);
        ctx.lineTo(i * pasoX, alto);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * pasoY);
        ctx.lineTo(ancho, i * pasoY);
        ctx.stroke();
      }
      ctx.restore();
    }
  }, [interactivo]);

  // Carga inicial y suscripción STOMP
  useEffect(() => {
    if (!comunidadId) return;

    let activo = true;

    async function inicializar() {
      try {
        const { data } = await api.get<RegionEstado[]>(`/api/comunidades/${comunidadId}/banner`);
        if (!activo) return;
        regionesRef.current.clear();
        for (const reg of data) {
          regionesRef.current.set(reg.regionIndex, {
            snapshotBase64: reg.snapshotPngBase64,
            trazos: [...reg.trazosDesdeSnapshot],
          });
        }
        await redibujarTodo();
      } catch (err) {
        if (activo) setError(extraerMensajeError(err));
      } finally {
        if (activo) setCargando(false);
      }
    }

    inicializar();

    if (sesion?.accessToken) {
      stompService.conectar(sesion.accessToken);
    }

    const desuscribir = stompService.suscribir<BannerTrazoEvento>(`/topic/banner/${comunidadId}`, (evento) => {
      if (!activo) return;
      let reg = regionesRef.current.get(evento.regionIndex);
      if (!reg) {
        reg = { snapshotBase64: null, trazos: [] };
        regionesRef.current.set(evento.regionIndex, reg);
      }
      reg.trazos.push(evento);

      const ctx = ctxRef.current;
      if (ctx) {
        const { ancho, alto } = dimRef.current;
        const estilo: EstiloPincel = {
          tipoPincel: (evento.tipoPincel ?? 'MARCADOR') as TipoPincel,
          colorHex: evento.colorHex ?? '#0B0912',
          grosor: evento.grosor ?? 18,
          opacidad: evento.opacidad ?? 1,
        };
        const puntosGlobales = evento.puntos.map((p) => aGlobal(evento.regionIndex, p));
        dibujarTrazoCompleto(ctx, estilo, puntosGlobales, ancho, alto);
      }
    });

    return () => {
      activo = false;
      desuscribir();
    };
  }, [comunidadId, sesion?.accessToken, redibujarTodo]);

  // Ajuste de tamaño dinámico del lienzo
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    function ajustar() {
      if (!container || !canvas) return;
      const ancho = Math.max(300, Math.floor(container.clientWidth));
      const alto = interactivo ? Math.max(350, Math.floor(container.clientHeight || alturaPx)) : alturaPx;

      if (canvas.width !== ancho || canvas.height !== alto) {
        canvas.width = ancho;
        canvas.height = alto;
        dimRef.current = { ancho, alto };
        ctxRef.current = canvas.getContext('2d');
        redibujarTodo();
      }
    }

    ajustar();
    const observer = new ResizeObserver(() => ajustar());
    observer.observe(container);
    return () => observer.disconnect();
  }, [alturaPx, interactivo, redibujarTodo]);

  function coordenadas(e: React.PointerEvent<HTMLCanvasElement>): Punto {
    const canvas = canvasRef.current;
    const rect = canvas ? canvas.getBoundingClientRect() : e.currentTarget.getBoundingClientRect();
    const w = rect.width || 1;
    const h = rect.height || 1;
    return {
      x: Math.min(0.999, Math.max(0.001, (e.clientX - rect.left) / w)),
      y: Math.min(0.999, Math.max(0.001, (e.clientY - rect.top) / h)),
    };
  }

  function alPresionar(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!interactivo) return;
    const punto = coordenadas(e);
    const { ancho, alto } = dimRef.current;
    const ctx = ctxRef.current;

    const estilo: EstiloPincel = {
      tipoPincel: esBorrador ? 'LAPIZ' : herramienta.tipoPincel,
      colorHex: esBorrador ? '#F5F1EA' : herramienta.colorHex,
      grosor: herramienta.grosor,
      opacidad: esBorrador ? 1 : herramienta.opacidad,
    };

    trazoActualRef.current = { puntos: [punto], estilo, esBorrador };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    if (ctx) {
      if (esBorrador) {
        dibujarBorrado(ctx, [punto], estilo.grosor * 1.5, ancho, alto);
      } else {
        dibujarPunto(ctx, estilo, punto, ancho, alto);
      }
    }
  }

  function alMover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!interactivo) return;
    const ctx = ctxRef.current;
    const actual = trazoActualRef.current;
    if (!ctx || e.buttons !== 1 || !actual) return;

    const punto = coordenadas(e);
    const anterior = actual.puntos[actual.puntos.length - 1];
    const { ancho, alto } = dimRef.current;

    if (actual.esBorrador) {
      dibujarBorrado(ctx, [anterior, punto], actual.estilo.grosor * 1.5, ancho, alto);
    } else {
      dibujarSegmento(ctx, actual.estilo, anterior, punto, ancho, alto);
    }
    actual.puntos.push(punto);
  }

  async function alSoltar() {
    if (!interactivo) return;
    const actual = trazoActualRef.current;
    trazoActualRef.current = null;
    if (!actual || actual.puntos.length === 0 || !comunidadId) return;

    // Segmentar los puntos según la región que atraviesan para persistirlos en el backend
    const segmentosPorRegion: { regionIndex: number; puntos: Punto[] }[] = [];
    let segmentoActual: { regionIndex: number; puntos: Punto[] } | null = null;

    for (const p of actual.puntos) {
      const reg = regionDe(p);
      const puntoLoc = aLocal(p, reg);
      if (!segmentoActual || segmentoActual.regionIndex !== reg) {
        segmentoActual = { regionIndex: reg, puntos: [puntoLoc] };
        segmentosPorRegion.push(segmentoActual);
      } else {
        segmentoActual.puntos.push(puntoLoc);
      }
    }

    // Enviar cada segmento para que quede guardado permanentemente en base de datos y snapshots
    for (const seg of segmentosPorRegion) {
      if (seg.puntos.length === 0) continue;
      try {
        await api.post(`/api/comunidades/${comunidadId}/banner/pintar`, {
          regionIndex: seg.regionIndex,
          tipoPincel: actual.esBorrador ? 'LAPIZ' : actual.estilo.tipoPincel,
          colorHex: actual.esBorrador ? '#F5F1EA' : actual.estilo.colorHex,
          grosor: actual.estilo.grosor,
          opacidad: actual.estilo.opacidad,
          puntos: seg.puntos,
        });
      } catch {
        // En caso de rate-limit o microerror, el canvas local ya lo muestra
      }
    }
  }

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden select-none">
      {/* Canvas Mural */}
      <canvas
        ref={canvasRef}
        className={`w-full ${interactivo ? 'cursor-crosshair touch-none' : 'pointer-events-none'}`}
        style={{ height: interactivo ? undefined : alturaPx }}
        onPointerDown={alPresionar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerLeave={alSoltar}
      />

      {cargando && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-ink-950/40 backdrop-blur-[2px]">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-coral border-t-transparent" />
        </div>
      )}

      {error && (
        <div className="absolute bottom-2 left-2 z-20 rounded bg-coral/20 px-2 py-1 text-xs text-coral-light">
          {error}
        </div>
      )}

      {/* Barra de herramientas interactiva estilo fiesta si está activo el modo pintor */}
      {interactivo && (
        <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-ink-800 bg-ink-900/90 p-3 shadow-2xl backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <BrushToolbar
              herramienta={herramienta}
              onCambiar={(nueva) => {
                setHerramienta(nueva);
                setEsBorrador(false);
              }}
              orientacion="horizontal"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEsBorrador((v) => !v)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  esBorrador
                    ? 'bg-coral text-ink-950 shadow-glow-coral'
                    : 'border border-ink-700 bg-ink-800 text-paper hover:bg-ink-700'
                }`}
              >
                {esBorrador ? '🧹 Borrador activo' : '🧹 Borrador'}
              </button>
              {onCerrarEdicion && (
                <Button variant="secondary" onClick={onCerrarEdicion}>
                  Listo
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
