import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, extraerMensajeError } from '../../lib/api';
import { stompService } from '../../lib/stompClient';
import { useAuthStore } from '../../lib/authStore';
import { dibujarSegmento, dibujarTrazoCompleto, type EstiloPincel } from '../../lib/canvasEngine';
import { BrushToolbar, type Herramienta } from './BrushToolbar';
import type { BloqueoEvento, ComunidadResponse, Punto, TrazoDto, TrazoEvento } from '../../types';

const INTERVALO_LOTE_MS = 30;

interface TrazoRemotoEnProgreso {
  estilo: EstiloPincel;
  ultimoPunto: Punto | null;
}

export function CanvasStudioPage() {
  const { id: comunidadId } = useParams<{ id: string }>();
  const sesion = useAuthStore((s) => s.sesion);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const [comunidad, setComunidad] = useState<ComunidadResponse | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorAcceso, setErrorAcceso] = useState<string | null>(null);
  const [herramienta, setHerramienta] = useState<Herramienta>({
    tipoPincel: 'ACUARELA',
    colorHex: '#FF6B57',
    grosor: 24,
    opacidad: 0.8,
  });
  const [modoEdicion, setModoEdicion] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [trazoEnEdicion, setTrazoEnEdicion] = useState<TrazoDto | null>(null);

  const trazosRef = useRef<Map<number, TrazoDto>>(new Map());
  const maxSecuenciaRef = useRef(0);
  const propioTrazoRef = useRef<{ id: string; puntos: Punto[]; pendientes: Punto[] } | null>(null);
  const remotosRef = useRef<Map<string, TrazoRemotoEnProgreso>>(new Map());
  const puntosEdicionRef = useRef<Punto[]>([]);

  const ladoPx = 720;

  const redibujarTodo = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.clearRect(0, 0, ladoPx, ladoPx);
    ctx.fillStyle = '#F5F1EA';
    ctx.fillRect(0, 0, ladoPx, ladoPx);
    const ordenados = [...trazosRef.current.values()].sort((a, b) => a.secuencia - b.secuencia);
    for (const t of ordenados) {
      dibujarTrazoCompleto(
        ctx,
        { tipoPincel: t.tipoPincel, colorHex: t.colorHex, grosor: t.grosor, opacidad: t.opacidad },
        t.puntos,
        ladoPx,
      );
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = ladoPx;
    canvas.height = ladoPx;
    ctxRef.current = canvas.getContext('2d');
    redibujarTodo();
  }, [redibujarTodo]);

  useEffect(() => {
    if (!comunidadId || !sesion) return;
    let activo = true;
    const bufferMensajes: TrazoEvento[] = [];

    api
      .get<ComunidadResponse>(`/api/comunidades/${comunidadId}`)
      .then((r) => activo && setComunidad(r.data))
      .catch((err) => activo && setErrorAcceso(extraerMensajeError(err, 'No puedes entrar a este lienzo')));

    stompService.conectar(sesion.accessToken);

    const desuscribirTrazos = stompService.suscribir<TrazoEvento>(`/topic/lienzo/${comunidadId}`, (evento) => {
      if (!activo) return;
      if (maxSecuenciaRef.current === 0 && trazosRef.current.size === 0) {
        // Todavia no llego el snapshot: guardamos para procesar en orden despues.
        bufferMensajes.push(evento);
        return;
      }
      procesarEvento(evento);
    });

    const desuscribirBloqueos = stompService.suscribir<BloqueoEvento>(`/topic/lienzo/${comunidadId}/bloqueos`, (evento) => {
      if (!activo) return;
      if (evento.tipo === 'TOMADO') {
        setAviso(`${evento.propietarioNombre} está editando un trazo`);
        setTimeout(() => setAviso(null), 3000);
      }
    });

    api
      .get<TrazoDto[]>(`/api/comunidades/${comunidadId}/lienzo/trazos`, { params: { desde: 0 } })
      .then((r) => {
        if (!activo) return;
        for (const t of r.data) {
          trazosRef.current.set(t.secuencia, t);
          maxSecuenciaRef.current = Math.max(maxSecuenciaRef.current, t.secuencia);
        }
        redibujarTodo();
        for (const evento of bufferMensajes) {
          if (evento.tipo === 'FINAL' && evento.secuencia && evento.secuencia <= maxSecuenciaRef.current) {
            continue;
          }
          procesarEvento(evento);
        }
      })
      .finally(() => activo && setCargando(false));

    function procesarEvento(evento: TrazoEvento) {
      const ctx = ctxRef.current;
      if (!ctx) return;
      const esPropio = evento.autorId === sesion?.usuarioId;

      if (evento.tipo === 'FINAL') {
        if (evento.secuencia != null) {
          const dto: TrazoDto = {
            id: evento.trazoEnProgresoId ?? crypto.randomUUID(),
            secuencia: evento.secuencia,
            autorId: evento.autorId,
            autorNombre: evento.autorNombre,
            tipoPincel: evento.tipoPincel,
            colorHex: evento.colorHex,
            grosor: evento.grosor,
            opacidad: evento.opacidad,
            capa: evento.capa,
            puntos: evento.puntos,
            creadoEn: new Date().toISOString(),
          };
          trazosRef.current.set(dto.secuencia, dto);
          maxSecuenciaRef.current = Math.max(maxSecuenciaRef.current, dto.secuencia);
        }
        if (evento.trazoEnProgresoId) remotosRef.current.delete(evento.trazoEnProgresoId);
        if (!esPropio) redibujarTodo();
        return;
      }

      if (evento.tipo === 'EDITADO') {
        if (evento.secuencia != null) {
          trazosRef.current.set(evento.secuencia, {
            id: evento.trazoEnProgresoId ?? crypto.randomUUID(),
            secuencia: evento.secuencia,
            autorId: evento.autorId,
            autorNombre: evento.autorNombre,
            tipoPincel: evento.tipoPincel,
            colorHex: evento.colorHex,
            grosor: evento.grosor,
            opacidad: evento.opacidad,
            capa: evento.capa,
            puntos: evento.puntos,
            creadoEn: new Date().toISOString(),
          });
        }
        redibujarTodo();
        return;
      }

      // PARCIAL de otra persona: dibujar solo el segmento nuevo.
      if (esPropio || !evento.trazoEnProgresoId) return;
      const clave = evento.trazoEnProgresoId;
      let estado = remotosRef.current.get(clave);
      if (!estado) {
        estado = {
          estilo: { tipoPincel: evento.tipoPincel, colorHex: evento.colorHex, grosor: evento.grosor, opacidad: evento.opacidad },
          ultimoPunto: null,
        };
        remotosRef.current.set(clave, estado);
      }
      for (const punto of evento.puntos) {
        if (estado.ultimoPunto) {
          dibujarSegmento(ctx, estado.estilo, estado.ultimoPunto, punto, ladoPx);
        }
        estado.ultimoPunto = punto;
      }
    }

    return () => {
      activo = false;
      desuscribirTrazos();
      desuscribirBloqueos();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comunidadId, sesion?.accessToken]);

  function coordenadasRelativas(e: React.PointerEvent<HTMLCanvasElement>): Punto {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }

  function alPresionar(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!comunidadId) return;
    const punto = coordenadasRelativas(e);

    if (modoEdicion) {
      const trazo = encontrarTrazoCercano(punto);
      if (!trazo) return;
      api
        .post(`/api/comunidades/${comunidadId}/lienzo/trazos/${trazo.id}/bloqueo`)
        .then(() => {
          setTrazoEnEdicion(trazo);
          puntosEdicionRef.current = [];
        })
        .catch((err) => setAviso(extraerMensajeError(err)));
      return;
    }

    const id = crypto.randomUUID();
    propioTrazoRef.current = { id, puntos: [punto], pendientes: [punto] };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function alMover(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const punto = coordenadasRelativas(e);

    if (trazoEnEdicion) {
      if (e.buttons !== 1) return;
      const anterior = puntosEdicionRef.current[puntosEdicionRef.current.length - 1];
      if (anterior) {
        dibujarSegmento(ctx, { tipoPincel: herramienta.tipoPincel, colorHex: '#FFC24B', grosor: herramienta.grosor, opacidad: 0.9 }, anterior, punto, ladoPx);
      }
      puntosEdicionRef.current.push(punto);
      return;
    }

    const actual = propioTrazoRef.current;
    if (!actual || e.buttons !== 1) return;
    const anterior = actual.puntos[actual.puntos.length - 1];
    dibujarSegmento(
      ctx,
      { tipoPincel: herramienta.tipoPincel, colorHex: herramienta.colorHex, grosor: herramienta.grosor, opacidad: herramienta.opacidad },
      anterior,
      punto,
      ladoPx,
    );
    actual.puntos.push(punto);
    actual.pendientes.push(punto);
  }

  function alSoltar() {
    const actual = propioTrazoRef.current;
    if (actual && comunidadId) {
      if (actual.pendientes.length > 0) {
        enviarParcial(comunidadId, actual.id, actual.pendientes);
      }
      stompService.publicar(`/app/lienzo/${comunidadId}/final`, {
        trazoEnProgresoId: actual.id,
        tipoPincel: herramienta.tipoPincel,
        colorHex: herramienta.colorHex,
        grosor: herramienta.grosor,
        opacidad: herramienta.opacidad,
        capa: 0,
        puntos: actual.puntos,
      });
    }
    propioTrazoRef.current = null;
  }

  function enviarParcial(comunidadId: string, trazoId: string, puntos: Punto[]) {
    stompService.publicar(`/app/lienzo/${comunidadId}/parcial`, {
      trazoEnProgresoId: trazoId,
      tipoPincel: herramienta.tipoPincel,
      colorHex: herramienta.colorHex,
      grosor: herramienta.grosor,
      opacidad: herramienta.opacidad,
      capa: 0,
      puntos,
    });
  }

  useEffect(() => {
    const intervalo = setInterval(() => {
      const actual = propioTrazoRef.current;
      if (actual && actual.pendientes.length > 0 && comunidadId) {
        enviarParcial(comunidadId, actual.id, actual.pendientes);
        actual.pendientes = [];
      }
    }, INTERVALO_LOTE_MS);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comunidadId, herramienta]);

  function encontrarTrazoCercano(punto: Punto): TrazoDto | null {
    let mejor: TrazoDto | null = null;
    let mejorDistancia = 0.02;
    for (const trazo of trazosRef.current.values()) {
      for (const p of trazo.puntos) {
        const d = Math.hypot(p.x - punto.x, p.y - punto.y);
        if (d < mejorDistancia) {
          mejorDistancia = d;
          mejor = trazo;
        }
      }
    }
    return mejor;
  }

  async function confirmarEdicion() {
    if (!trazoEnEdicion || !comunidadId) return;
    try {
      await api.put(`/api/comunidades/${comunidadId}/lienzo/trazos/${trazoEnEdicion.id}`, {
        tipoPincel: herramienta.tipoPincel,
        colorHex: herramienta.colorHex,
        grosor: herramienta.grosor,
        opacidad: herramienta.opacidad,
        puntos: puntosEdicionRef.current.length > 1 ? puntosEdicionRef.current : trazoEnEdicion.puntos,
      });
    } catch (err) {
      setAviso(extraerMensajeError(err));
    } finally {
      await api.delete(`/api/comunidades/${comunidadId}/lienzo/trazos/${trazoEnEdicion.id}/bloqueo`).catch(() => {});
      setTrazoEnEdicion(null);
      setModoEdicion(false);
    }
  }

  async function cancelarEdicion() {
    if (!trazoEnEdicion || !comunidadId) return;
    await api.delete(`/api/comunidades/${comunidadId}/lienzo/trazos/${trazoEnEdicion.id}/bloqueo`).catch(() => {});
    setTrazoEnEdicion(null);
    redibujarTodo();
  }

  if (errorAcceso) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <p className="text-coral-light">{errorAcceso}</p>
        <Link to="/comunidades" className="btn-secondary mt-4">
          Volver a comunidades
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="label">Lienzo colaborativo</p>
          <h1 className="font-display text-2xl font-semibold">{comunidad?.nombre ?? '…'}</h1>
        </div>
        <Link to={`/comunidades/${comunidadId}`} className="btn-ghost">
          ← Volver a la comunidad
        </Link>
      </div>

      {aviso && (
        <div className="mb-3 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber">{aviso}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <BrushToolbar
          herramienta={herramienta}
          onCambiar={setHerramienta}
          modoEdicion={modoEdicion}
          onToggleEdicion={() => setModoEdicion((v) => !v)}
          deshabilitado={!!trazoEnEdicion}
        />

        <div>
          <div className="card relative mx-auto aspect-square w-full max-w-[720px] overflow-hidden p-0">
            {cargando && (
              <div className="absolute inset-0 z-10 grid place-items-center bg-ink-900/60 backdrop-blur-sm">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet border-t-transparent" />
              </div>
            )}
            <canvas
              ref={canvasRef}
              className="h-full w-full touch-none rounded-2xl"
              style={{ cursor: modoEdicion ? 'crosshair' : 'url(data:,) 0 0, crosshair' }}
              onPointerDown={alPresionar}
              onPointerMove={alMover}
              onPointerUp={alSoltar}
              onPointerLeave={alSoltar}
            />
          </div>

          {trazoEnEdicion && (
            <div className="card mt-4 flex items-center justify-between p-4">
              <p className="text-sm text-amber">Tienes tomado este trazo — dibuja encima para reemplazarlo</p>
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={cancelarEdicion}>
                  Cancelar
                </button>
                <button className="btn-primary" onClick={confirmarEdicion}>
                  Confirmar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
