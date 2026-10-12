import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, extraerMensajeError } from '../../lib/api';
import { stompService } from '../../lib/stompClient';
import { useAuthStore } from '../../lib/authStore';
import { dibujarSegmento, dibujarTrazoCompleto } from '../../lib/canvasEngine';
import { BrushToolbar, type Herramienta } from './BrushToolbar';
import type { BannerTrazoEvento, Punto, RegionEstado } from '../../types';

const REGIONES_POR_LADO = 10;
const TAMANO_REGION = 1 / REGIONES_POR_LADO;

export function BannerMuralPage() {
  const { id: comunidadId } = useParams<{ id: string }>();
  const sesion = useAuthStore((s) => s.sesion);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const ladoPx = 700;

  const [cargando, setCargando] = useState(true);
  const [herramienta, setHerramienta] = useState<Herramienta>({ tipoPincel: 'MARCADOR', colorHex: '#2FD9C4', grosor: 14, opacidad: 1 });
  const [aviso, setAviso] = useState<string | null>(null);

  const dibujandoRef = useRef<{ regionIndex: number; puntos: Punto[]; trazoId: string } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !comunidadId || !sesion) return;
    canvas.width = ladoPx;
    canvas.height = ladoPx;
    const ctx = canvas.getContext('2d');
    ctxRef.current = ctx;
    if (!ctx) return;

    ctx.fillStyle = '#F5F1EA';
    ctx.fillRect(0, 0, ladoPx, ladoPx);
    dibujarCuadricula(ctx, ladoPx);

    stompService.conectar(sesion.accessToken);
    const desuscribir = stompService.suscribir<BannerTrazoEvento>(`/topic/banner/${comunidadId}`, (evento) => {
      const estilo = { tipoPincel: evento.tipoPincel, colorHex: evento.colorHex, grosor: evento.grosor / 3, opacidad: evento.opacidad };
      const puntosGlobales = evento.puntos.map((p) => aGlobal(evento.regionIndex, p));
      dibujarTrazoCompleto(ctx, estilo, puntosGlobales, ladoPx);
    });

    api
      .get<RegionEstado[]>(`/api/comunidades/${comunidadId}/banner`)
      .then(async (r) => {
        for (const region of r.data) {
          if (region.snapshotPngBase64) {
            await dibujarSnapshot(ctx, region.regionIndex, region.snapshotPngBase64, ladoPx);
          }
          for (const t of region.trazosDesdeSnapshot) {
            const estilo = { tipoPincel: t.tipoPincel, colorHex: t.colorHex, grosor: t.grosor / 3, opacidad: t.opacidad };
            const puntosGlobales = t.puntos.map((p) => aGlobal(t.regionIndex, p));
            dibujarTrazoCompleto(ctx, estilo, puntosGlobales, ladoPx);
          }
        }
        dibujarCuadricula(ctx, ladoPx);
      })
      .finally(() => setCargando(false));

    return desuscribir;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comunidadId, sesion?.accessToken]);

  function coordenadas(e: React.PointerEvent<HTMLCanvasElement>): Punto {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(0.999, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(0.999, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }

  function regionDe(punto: Punto): number {
    const col = Math.floor(punto.x / TAMANO_REGION);
    const fila = Math.floor(punto.y / TAMANO_REGION);
    return fila * REGIONES_POR_LADO + col;
  }

  function aLocal(punto: Punto, regionIndex: number): Punto {
    const col = regionIndex % REGIONES_POR_LADO;
    const fila = Math.floor(regionIndex / REGIONES_POR_LADO);
    return { x: (punto.x - col * TAMANO_REGION) / TAMANO_REGION, y: (punto.y - fila * TAMANO_REGION) / TAMANO_REGION };
  }

  function alPresionar(e: React.PointerEvent<HTMLCanvasElement>) {
    const punto = coordenadas(e);
    dibujandoRef.current = { regionIndex: regionDe(punto), puntos: [aLocal(punto, regionDe(punto))], trazoId: crypto.randomUUID() };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function alMover(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = ctxRef.current;
    const actual = dibujandoRef.current;
    if (!ctx || !actual || e.buttons !== 1) return;
    const punto = coordenadas(e);
    if (regionDe(punto) !== actual.regionIndex) return; // un trazo no cruza de region
    const anteriorGlobal = aGlobal(actual.regionIndex, actual.puntos[actual.puntos.length - 1]);
    dibujarSegmento(ctx, { ...herramienta, grosor: herramienta.grosor / 3 }, anteriorGlobal, punto, ladoPx);
    actual.puntos.push(aLocal(punto, actual.regionIndex));
  }

  async function alSoltar() {
    const actual = dibujandoRef.current;
    dibujandoRef.current = null;
    if (!actual || !comunidadId || actual.puntos.length === 0) return;
    try {
      await api.post(`/api/comunidades/${comunidadId}/banner/pintar`, {
        regionIndex: actual.regionIndex,
        tipoPincel: herramienta.tipoPincel,
        colorHex: herramienta.colorHex,
        grosor: herramienta.grosor,
        opacidad: herramienta.opacidad,
        puntos: actual.puntos,
      });
    } catch (err) {
      setAviso(extraerMensajeError(err));
      setTimeout(() => setAviso(null), 3000);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="label">Banner comunitario · 1000×1000</p>
          <h1 className="font-display text-2xl font-semibold">Mural entre muchos</h1>
        </div>
        <Link to={`/comunidades/${comunidadId}`} className="btn-ghost">
          ← Volver a la comunidad
        </Link>
      </div>

      {aviso && <div className="mb-3 rounded-lg border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-coral-light">{aviso}</div>}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <BrushToolbar herramienta={herramienta} onCambiar={setHerramienta} modoEdicion={false} onToggleEdicion={() => {}} />
        <div className="card relative mx-auto aspect-square w-full max-w-[700px] overflow-hidden p-0">
          {cargando && (
            <div className="absolute inset-0 z-10 grid place-items-center bg-ink-900/60 backdrop-blur-sm">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal border-t-transparent" />
            </div>
          )}
          <canvas
            ref={canvasRef}
            className="h-full w-full touch-none rounded-2xl"
            onPointerDown={alPresionar}
            onPointerMove={alMover}
            onPointerUp={alSoltar}
            onPointerLeave={alSoltar}
          />
        </div>
      </div>
    </div>
  );
}

function aGlobal(regionIndex: number, local: Punto): Punto {
  const col = regionIndex % REGIONES_POR_LADO;
  const fila = Math.floor(regionIndex / REGIONES_POR_LADO);
  return { x: col * TAMANO_REGION + local.x * TAMANO_REGION, y: fila * TAMANO_REGION + local.y * TAMANO_REGION };
}

function dibujarCuadricula(ctx: CanvasRenderingContext2D, ladoPx: number) {
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 1;
  const paso = ladoPx / REGIONES_POR_LADO;
  for (let i = 1; i < REGIONES_POR_LADO; i++) {
    ctx.beginPath();
    ctx.moveTo(i * paso, 0);
    ctx.lineTo(i * paso, ladoPx);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * paso);
    ctx.lineTo(ladoPx, i * paso);
    ctx.stroke();
  }
  ctx.restore();
}

function dibujarSnapshot(ctx: CanvasRenderingContext2D, regionIndex: number, base64: string, ladoPx: number): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const col = regionIndex % REGIONES_POR_LADO;
      const fila = Math.floor(regionIndex / REGIONES_POR_LADO);
      const paso = ladoPx / REGIONES_POR_LADO;
      ctx.drawImage(img, col * paso, fila * paso, paso, paso);
      resolve();
    };
    img.onerror = () => resolve();
    img.src = `data:image/png;base64,${base64}`;
  });
}
