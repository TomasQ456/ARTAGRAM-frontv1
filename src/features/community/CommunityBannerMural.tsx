import { useEffect, useRef, useState, useCallback } from 'react';
import { api, extraerMensajeError } from '../../lib/api';
import { stompService } from '../../lib/stompClient';
import { useAuthStore } from '../../lib/authStore';
import { dibujarPunto, dibujarSegmento, dibujarTrazoCompleto, type EstiloPincel } from '../../lib/canvasEngine';
import { BrushToolbar, type Herramienta } from '../canvas/BrushToolbar';
import { Button } from '../../components/ui/Button';
import type { BannerTrazoEvento, Punto, RegionEstado, TipoPincel } from '../../types';

const REGIONES_POR_LADO = 10;
const TAMANO_REGION = 1 / REGIONES_POR_LADO;

interface Props {
  comunidadId: string;
  interactivo?: boolean;
  alturaPx?: number;
  mostrarBarraHerramientas?: boolean;
  onCerrarEdicion?: () => void;
}

export function CommunityBannerMural({
  comunidadId,
  interactivo = false,
  alturaPx = 280,
  mostrarBarraHerramientas = true,
  onCerrarEdicion,
}: Props) {
  const sesion = useAuthStore((s) => s.sesion);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
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
  const imageCacheRef = useRef<Map<number, HTMLImageElement>>(new Map());
  const trazoActualRef = useRef<{ puntos: Punto[]; estilo: EstiloPincel; esBorrador: boolean } | null>(null);
  const dimRef = useRef<{ ancho: number; alto: number }>({ ancho: 1000, alto: alturaPx });

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

    // 1. Dibujar snapshots de regiones (con caché de imágenes para rendimiento)
    const promesas: Promise<void>[] = [];
    for (const [regionIndex, reg] of regionesRef.current.entries()) {
      if (reg.snapshotBase64) {
        let img = imageCacheRef.current.get(regionIndex);
        if (!img || img.dataset.srcBase64 !== reg.snapshotBase64) {
          const p = new Promise<void>((resolve) => {
            const nuevaImg = new Image();
            nuevaImg.onload = () => {
              nuevaImg.dataset.srcBase64 = reg.snapshotBase64!;
              imageCacheRef.current.set(regionIndex, nuevaImg);
              resolve();
            };
            nuevaImg.onerror = () => resolve();
            nuevaImg.src = `data:image/png;base64,${reg.snapshotBase64}`;
          });
          promesas.push(p);
        }
      }
    }
    if (promesas.length > 0) {
      await Promise.all(promesas);
    }

    // Dibujar snapshots cargados
    for (const [regionIndex, reg] of regionesRef.current.entries()) {
      if (reg.snapshotBase64) {
        const img = imageCacheRef.current.get(regionIndex);
        if (img) {
          const col = regionIndex % REGIONES_POR_LADO;
          const fila = Math.floor(regionIndex / REGIONES_POR_LADO);
          ctx.drawImage(img, col * pasoX, fila * pasoY, pasoX, pasoY);
        }
      }
    }

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
        setError(null);
      } catch (err) {
        if (activo) {
          console.warn('No se pudo cargar el banner inicial:', err);
          setError(extraerMensajeError(err));
        }
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
      // Si el autor es el usuario actual, ya lo dibujamos y almacenamos localmente en tiempo real
      if (evento.autorId === sesion?.usuarioId) {
        return;
      }
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
  }, [comunidadId, sesion?.accessToken, sesion?.usuarioId, redibujarTodo]);

  // Ajuste de tamaño dinámico y resolución del lienzo
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    function ajustar() {
      if (!container || !canvas) return;
      const ancho = Math.max(300, Math.floor(container.clientWidth));
      const alto = alturaPx;

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
  }, [alturaPx, redibujarTodo]);

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
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const punto = coordenadas(e);
    const { ancho, alto } = dimRef.current;
    const ctx = ctxRef.current;

    const estilo: EstiloPincel = {
      tipoPincel: esBorrador ? 'LAPIZ' : herramienta.tipoPincel,
      colorHex: esBorrador ? '#F5F1EA' : herramienta.colorHex,
      grosor: esBorrador ? Math.max(14, herramienta.grosor * 1.4) : herramienta.grosor,
      opacidad: esBorrador ? 1 : herramienta.opacidad,
    };

    trazoActualRef.current = { puntos: [punto], estilo, esBorrador };

    if (ctx) {
      dibujarPunto(ctx, estilo, punto, ancho, alto);
    }
  }

  function alMover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!interactivo) return;
    const ctx = ctxRef.current;
    const actual = trazoActualRef.current;
    if (!ctx || !actual) return;

    if (e.pointerType === 'mouse' && e.buttons === 0) {
      alSoltar(e);
      return;
    }

    const punto = coordenadas(e);
    const anterior = actual.puntos[actual.puntos.length - 1];
    const { ancho, alto } = dimRef.current;

    dibujarSegmento(ctx, actual.estilo, anterior, punto, ancho, alto);
    actual.puntos.push(punto);
  }

  async function alSoltar(e?: React.PointerEvent<HTMLCanvasElement>) {
    if (e && canvasRef.current) {
      try {
        if (canvasRef.current.hasPointerCapture(e.pointerId)) {
          canvasRef.current.releasePointerCapture(e.pointerId);
        }
      } catch {
        // ignore
      }
    }
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

    // 1. Guardar de inmediato en memoria local para que redibujarTodo NO borre el trazo
    for (const seg of segmentosPorRegion) {
      if (seg.puntos.length === 0) continue;
      let regMem = regionesRef.current.get(seg.regionIndex);
      if (!regMem) {
        regMem = { snapshotBase64: null, trazos: [] };
        regionesRef.current.set(seg.regionIndex, regMem);
      }
      regMem.trazos.push({
        regionIndex: seg.regionIndex,
        secuencia: Date.now(),
        autorId: sesion?.usuarioId ?? '',
        autorNombre: sesion?.nombreArtista ?? 'Tú',
        tipoPincel: actual.esBorrador ? 'LAPIZ' : actual.estilo.tipoPincel,
        colorHex: actual.esBorrador ? '#F5F1EA' : actual.estilo.colorHex,
        grosor: actual.estilo.grosor,
        opacidad: actual.estilo.opacidad,
        puntos: seg.puntos,
      });
    }

    // 2. Persistir en base de datos dividiendo en bloques <= 250 puntos si el trazo es extenso
    setGuardando(true);
    try {
      for (const seg of segmentosPorRegion) {
        if (seg.puntos.length === 0) continue;
        const CHUNK_SIZE = 250;
        for (let i = 0; i < seg.puntos.length; i += CHUNK_SIZE) {
          const chunk = seg.puntos.slice(i, i + CHUNK_SIZE);
          await api.post(`/api/comunidades/${comunidadId}/banner/pintar`, {
            regionIndex: seg.regionIndex,
            tipoPincel: actual.esBorrador ? 'LAPIZ' : actual.estilo.tipoPincel,
            colorHex: actual.esBorrador ? '#F5F1EA' : actual.estilo.colorHex,
            grosor: actual.estilo.grosor,
            opacidad: actual.estilo.opacidad,
            puntos: chunk,
          });
        }
      }
      setError(null);
    } catch (err) {
      console.warn('Error al guardar segmento de banner:', err);
      setError(extraerMensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden select-none"
      style={{ height: `${alturaPx}px` }}
    >
      {/* Canvas Mural */}
      <canvas
        ref={canvasRef}
        className={`w-full block ${interactivo ? 'cursor-crosshair touch-none' : 'pointer-events-none'}`}
        style={{ height: `${alturaPx}px`, width: '100%' }}
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

      {/* Indicador de estado de persistencia */}
      <div className="absolute top-2 right-2 z-20 flex items-center gap-2">
        {guardando && (
          <span className="flex items-center gap-1.5 rounded-full bg-ink-900/90 border border-coral/40 px-2.5 py-1 text-[11px] font-medium text-coral-light backdrop-blur-md shadow-md animate-pulse">
            <span className="h-2 w-2 rounded-full bg-coral animate-ping" />
            Grabando en mural permanente…
          </span>
        )}
      </div>

      {error && (
        <div className="absolute bottom-2 left-2 z-20 rounded bg-coral/30 border border-coral px-2.5 py-1 text-xs text-coral-light backdrop-blur-md">
          {error}
        </div>
      )}

      {/* Barra de herramientas flotante estilo fiesta si está activo el modo pintor */}
      {interactivo && mostrarBarraHerramientas && (
        <div className="absolute bottom-3 left-3 right-3 z-30 flex flex-col gap-2 rounded-2xl border border-ink-700 bg-ink-950/95 p-3 shadow-2xl backdrop-blur-md">
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
                    ? 'bg-coral text-ink-950 shadow-glow-coral font-bold'
                    : 'border border-ink-700 bg-ink-800 text-paper hover:bg-ink-700'
                }`}
              >
                {esBorrador ? '🧹 Borrador activo' : '🧹 Borrador'}
              </button>
              {onCerrarEdicion && (
                <Button variant="primary" onClick={onCerrarEdicion} className="text-xs py-1.5 px-3">
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
