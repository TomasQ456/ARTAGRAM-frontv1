import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, extraerMensajeError } from '../../lib/api';
import { stompService } from '../../lib/stompClient';
import { useAuthStore } from '../../lib/authStore';
import { dibujarPunto, dibujarSegmento, dibujarTrazoCompleto, type EstiloPincel } from '../../lib/canvasEngine';
import { BrushToolbar, type Herramienta } from './BrushToolbar';
import { PublishWizard } from '../feed/PublishWizard';
import type { BloqueoEvento, ComunidadResponse, Punto, TrazoDto, TrazoEvento } from '../../types';

interface TrazoRemotoEnProgreso {
  estilo: EstiloPincel;
  ultimoPunto: Punto | null;
}

export function CanvasStudioPage() {
  const { id: comunidadId } = useParams<{ id: string }>();
  const sesion = useAuthStore((s) => s.sesion);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const dimRef = useRef<{ ancho: number; alto: number }>({ ancho: 1200, alto: 800 });

  const [comunidad, setComunidad] = useState<ComunidadResponse | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorAcceso, setErrorAcceso] = useState<string | null>(null);
  const [herramienta, setHerramienta] = useState<Herramienta>({
    tipoPincel: 'ACUARELA',
    colorHex: '#FF6B57',
    grosor: 20,
    opacidad: 0.85,
  });
  const [aviso, setAviso] = useState<string | null>(null);
  const [trazoEnEdicion, setTrazoEnEdicion] = useState<TrazoDto | null>(null);

  // Estado para el modal de publicación directa desde el lienzo
  const [modalPublicar, setModalPublicar] = useState(false);
  const [archivoPublicar, setArchivoPublicar] = useState<File | null>(null);

  const trazosRef = useRef<Map<number, TrazoDto>>(new Map());
  const maxSecuenciaRef = useRef(0);
  const propioTrazoRef = useRef<{ id: string; puntos: Punto[]; pendientes: Punto[] } | null>(null);
  const remotosRef = useRef<Map<string, TrazoRemotoEnProgreso>>(new Map());
  const puntosEdicionRef = useRef<Punto[]>([]);

  const redibujarTodo = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const { ancho, alto } = dimRef.current;
    ctx.clearRect(0, 0, ancho, alto);
    ctx.fillStyle = '#F5F1EA';
    ctx.fillRect(0, 0, ancho, alto);
    const ordenados = [...trazosRef.current.values()].sort((a, b) => a.secuencia - b.secuencia);
    for (const t of ordenados) {
      dibujarTrazoCompleto(
        ctx,
        { tipoPincel: t.tipoPincel, colorHex: t.colorHex, grosor: t.grosor, opacidad: t.opacidad },
        t.puntos,
        ancho,
        alto,
      );
    }
  }, []);

  // Adaptación dinámica del lienzo a la forma y tamaño de la pantalla
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    function ajustarDimensiones() {
      if (!container || !canvas) return;
      const ancho = Math.max(300, Math.floor(container.clientWidth));
      const alto = Math.max(300, Math.floor(container.clientHeight));
      if (canvas.width !== ancho || canvas.height !== alto) {
        canvas.width = ancho;
        canvas.height = alto;
        dimRef.current = { ancho, alto };
        ctxRef.current = canvas.getContext('2d');
        redibujarTodo();
      }
    }

    ajustarDimensiones();
    const observer = new ResizeObserver(() => {
      ajustarDimensiones();
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, [redibujarTodo]);

  // Conexión STOMP y sincronización de trazos y bloqueos
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
        // Todavía no llegó el snapshot inicial: almacenar para procesar en orden
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
      const { ancho, alto } = dimRef.current;
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

      // Trazo en progreso recibido en tiempo real de otro usuario
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
          dibujarSegmento(ctx, estado.estilo, estado.ultimoPunto, punto, ancho, alto);
        } else {
          // Si es el primer punto, dibujamos el punto inmediatamente para respuesta instantánea
          dibujarPunto(ctx, estado.estilo, punto, ancho, alto);
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
  }, [comunidadId, sesion?.accessToken, redibujarTodo]);

  function coordenadasRelativas(e: React.PointerEvent<HTMLCanvasElement>): Punto {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }

  function iniciarEdicionTrazo(punto: Punto) {
    if (!comunidadId) return;
    const trazo = encontrarTrazoCercano(punto);
    if (!trazo) return;
    api
      .post(`/api/comunidades/${comunidadId}/lienzo/trazos/${trazo.id}/bloqueo`)
      .then(() => {
        setTrazoEnEdicion(trazo);
        puntosEdicionRef.current = [];
        setAviso(`Trazo de ${trazo.autorNombre} seleccionado para edición. Dibuja para reemplazarlo.`);
      })
      .catch((err) => setAviso(extraerMensajeError(err)));
  }

  function alDobleClic(e: React.MouseEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const punto = coordenadasRelativas(e as unknown as React.PointerEvent<HTMLCanvasElement>);
    iniciarEdicionTrazo(punto);
  }

  function alClicDerecho(e: React.MouseEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const punto = coordenadasRelativas(e as unknown as React.PointerEvent<HTMLCanvasElement>);
    iniciarEdicionTrazo(punto);
  }

  function alPresionar(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!comunidadId) return;
    const punto = coordenadasRelativas(e);
    const { ancho, alto } = dimRef.current;
    const ctx = ctxRef.current;

    // Si mantiene Alt presionado, selecciona el trazo directamente
    if (e.altKey) {
      iniciarEdicionTrazo(punto);
      return;
    }

    const id = crypto.randomUUID();
    propioTrazoRef.current = { id, puntos: [punto], pendientes: [punto] };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    // Dibujar el punto inicial localmente
    if (ctx) {
      dibujarPunto(
        ctx,
        { tipoPincel: herramienta.tipoPincel, colorHex: herramienta.colorHex, grosor: herramienta.grosor, opacidad: herramienta.opacidad },
        punto,
        ancho,
        alto,
      );
    }
    // Emitir inmediatamente para que los demás vean el inicio del trazo de inmediato
    enviarParcial(comunidadId, id, [punto]);
  }

  function alMover(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const punto = coordenadasRelativas(e);
    const { ancho, alto } = dimRef.current;

    if (trazoEnEdicion) {
      if (e.buttons !== 1) return;
      const anterior = puntosEdicionRef.current[puntosEdicionRef.current.length - 1];
      if (anterior) {
        dibujarSegmento(
          ctx,
          { tipoPincel: herramienta.tipoPincel, colorHex: '#FFC24B', grosor: herramienta.grosor, opacidad: 0.9 },
          anterior,
          punto,
          ancho,
          alto,
        );
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
      ancho,
      alto,
    );
    actual.puntos.push(punto);
    actual.pendientes.push(punto);

    // Si se acumulan 3 puntos en movimiento, despachar inmediatamente para que los demás lo vean en tiempo real
    if (actual.pendientes.length >= 3 && comunidadId) {
      enviarParcial(comunidadId, actual.id, actual.pendientes);
      actual.pendientes = [punto]; // Deja el punto actual como origen del siguiente lote
    }
  }

  function alSoltar() {
    const actual = propioTrazoRef.current;
    if (actual && comunidadId) {
      if (actual.pendientes.length > 1) {
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

  // Intervalo rápido para vaciar puntos pendientes restantes durante el movimiento
  useEffect(() => {
    const intervalo = setInterval(() => {
      const actual = propioTrazoRef.current;
      if (actual && actual.pendientes.length > 1 && comunidadId) {
        enviarParcial(comunidadId, actual.id, actual.pendientes);
        const ultimo = actual.pendientes[actual.pendientes.length - 1];
        actual.pendientes = [ultimo];
      }
    }, 25);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comunidadId, herramienta]);

  function encontrarTrazoCercano(punto: Punto): TrazoDto | null {
    let mejor: TrazoDto | null = null;
    let mejorDistancia = 0.03;
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
    }
  }

  async function cancelarEdicion() {
    if (!trazoEnEdicion || !comunidadId) return;
    await api.delete(`/api/comunidades/${comunidadId}/lienzo/trazos/${trazoEnEdicion.id}/bloqueo`).catch(() => {});
    setTrazoEnEdicion(null);
    redibujarTodo();
  }

  // Publicar obra directamente desde el lienzo
  function abrirPublicar() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const nombreLimpio = (comunidad?.nombre || 'obra-lienzo')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-');
      const archivo = new File([blob], `${nombreLimpio}-${Date.now()}.png`, { type: 'image/png' });
      setArchivoPublicar(archivo);
      setModalPublicar(true);
    }, 'image/png');
  }

  // Descarga rápida PNG
  function descargarSnapshot() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const enlace = document.createElement('a');
    const nombreLimpio = (comunidad?.nombre || 'lienzo-artagram')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-');
    enlace.download = `${nombreLimpio}.png`;
    enlace.href = canvas.toDataURL('image/png');
    enlace.click();
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
    <div className="flex h-[calc(100vh-4.5rem)] flex-col bg-ink-950 p-2 sm:p-3 gap-2 overflow-hidden select-none">
      {/* Cabecera compacta del estudio */}
      <header className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-3">
          <Link
            to={`/comunidades/${comunidadId}`}
            className="btn-ghost text-xs px-2.5 py-1.5 flex items-center gap-1 border border-ink-800"
            title="Volver a la página de la comunidad"
          >
            ← Volver
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-lg font-bold tracking-tight text-paper">
                {comunidad?.nombre ?? 'Lienzo Colaborativo'}
              </h1>
              <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                ● En vivo
              </span>
            </div>
            <p className="text-[11px] text-paper-dim hidden sm:block">
              Lienzo responsivo de pantalla completa · Haz doble clic o clic derecho sobre cualquier trazo para editarlo
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={descargarSnapshot}
            className="btn-ghost text-xs px-2.5 py-1.5 border border-ink-800 text-paper-muted hover:text-paper"
            title="Descargar snapshot PNG del lienzo actual"
          >
            💾 Descargar
          </button>
          <button
            type="button"
            onClick={abrirPublicar}
            className="btn-primary text-xs px-3.5 py-1.5 flex items-center gap-1.5 font-semibold shadow-md shadow-coral/25 bg-gradient-to-r from-coral to-violet hover:brightness-110"
            title="Publicar esta obra colaborativa directamente en el Feed"
          >
            <span>🎨</span>
            <span>Publicar obra</span>
          </button>
        </div>
      </header>

      {/* Banner de aviso o notificación */}
      {aviso && (
        <div className="rounded-lg border border-amber/40 bg-amber/10 px-3 py-1.5 text-xs text-amber flex items-center justify-between">
          <span>{aviso}</span>
          <button type="button" onClick={() => setAviso(null)} className="text-amber/70 hover:text-amber">
            ✕
          </button>
        </div>
      )}

      {/* Barra de herramientas horizontal estilo Paint siempre presente */}
      <BrushToolbar
        herramienta={herramienta}
        onCambiar={setHerramienta}
        deshabilitado={!!trazoEnEdicion}
        orientacion="horizontal"
        onPublicar={abrirPublicar}
      />

      {/* Contenedor del lienzo que ocupa toda la forma de la pantalla restante */}
      <div
        ref={containerRef}
        className="relative flex-1 w-full min-h-0 rounded-2xl border border-ink-800 bg-[#F5F1EA] shadow-inner overflow-hidden cursor-crosshair"
      >
        {cargando && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-ink-900/60 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2 text-paper">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-coral border-t-transparent" />
              <p className="text-xs text-paper-muted">Sincronizando lienzo con la comunidad…</p>
            </div>
          </div>
        )}

        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none select-none"
          style={{ cursor: 'crosshair' }}
          onPointerDown={alPresionar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerLeave={alSoltar}
          onDoubleClick={alDobleClic}
          onContextMenu={alClicDerecho}
        />

        {/* Panel flotante de edición de trazo bloqueado */}
        {trazoEnEdicion && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 rounded-xl border border-amber/50 bg-ink-900/90 px-4 py-2.5 shadow-2xl backdrop-blur-md">
            <p className="text-xs text-amber font-medium">🎯 Editando trazo de {trazoEnEdicion.autorNombre} — dibuja encima para reemplazarlo</p>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary text-xs px-2.5 py-1" onClick={cancelarEdicion}>
                Cancelar
              </button>
              <button type="button" className="btn-primary text-xs px-3 py-1 font-semibold" onClick={confirmarEdicion}>
                Confirmar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal para publicar obra directamente desde el lienzo */}
      {modalPublicar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/80 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-2xl my-8">
            <PublishWizard
              archivoInicial={archivoPublicar}
              onPublicado={(pub) => {
                setModalPublicar(false);
                setAviso(`¡Obra "${pub.titulo}" publicada con éxito en el Feed! 🎨`);
                setTimeout(() => setAviso(null), 5000);
              }}
              onCerrar={() => setModalPublicar(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
