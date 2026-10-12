import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { api, extraerMensajeError } from '../../lib/api';
import { stompService } from '../../lib/stompClient';
import { useAuthStore } from '../../lib/authStore';
import { FondoEstudio } from '../../components/layout/FondoEstudio';
import { dibujarBorrado, dibujarTrazoCompleto } from '../../lib/canvasEngine';
import { CodigoSalaBadge } from './CodigoSalaBadge';
import type { EstadoRondaResponse, PartyEvento, PartyTrazoDto, Punto, SalaFiestaResponse } from '../../types';

const GROSOR_BORRADOR = 40;
const ladoPx = 640;

export function PartyRoomPage() {
  const { id: salaId } = useParams<{ id: string }>();
  const sesion = useAuthStore((s) => s.sesion);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const [sala, setSala] = useState<SalaFiestaResponse | null>(null);
  const [estado, setEstado] = useState<EstadoRondaResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [msRestantesVista, setMsRestantesVista] = useState(0);
  const [propietarioBorrador, setPropietarioBorrador] = useState<string | null>(null);
  const [modoBorrador, setModoBorrador] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const secuenciasVistasRef = useRef<Set<number>>(new Set());
  const puntosActualesRef = useRef<Punto[]>([]);
  const relojRef = useRef<{ recibidoEn: number; msRestantes: number }>({ recibidoEn: 0, msRestantes: 0 });
  const enRondaRef = useRef(false);

  const esAnfitrion = sala && sesion && sala.anfitrionNombre === sesion.nombreArtista;
  const tengoElBorrador = propietarioBorrador === sesion?.nombreArtista;
  const enRonda = estado?.estadoSala === 'EN_RONDA';

  function limpiarLienzo() {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.clearRect(0, 0, ladoPx, ladoPx);
    ctx.fillStyle = '#F5F1EA';
    ctx.fillRect(0, 0, ladoPx, ladoPx);
  }

  const dibujarTrazoParty = useCallback((t: PartyTrazoDto) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (t.borrador) {
      dibujarBorrado(ctx, t.puntos, GROSOR_BORRADOR, ladoPx);
    } else if (t.tipoPincel) {
      dibujarTrazoCompleto(ctx, { tipoPincel: t.tipoPincel, colorHex: t.colorHex ?? '#000', grosor: t.grosor, opacidad: t.opacidad }, t.puntos, ladoPx);
    }
  }, []);

  const cargarEstado = useCallback(async () => {
    if (!salaId) return;
    const { data } = await api.get<EstadoRondaResponse>(`/api/fiestas/${salaId}/estado`);
    setEstado(data);
    enRondaRef.current = data.estadoSala === 'EN_RONDA';
    setPropietarioBorrador(data.borradorPropietario);
    relojRef.current = { recibidoEn: performance.now(), msRestantes: data.msRestantes };
    setMsRestantesVista(data.msRestantes);
    secuenciasVistasRef.current = new Set(data.trazos.map((t) => t.secuencia));
    limpiarLienzo();
    for (const t of data.trazos) dibujarTrazoParty(t);
  }, [salaId, dibujarTrazoParty]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !salaId || !sesion) return;
    canvas.width = ladoPx;
    canvas.height = ladoPx;
    ctxRef.current = canvas.getContext('2d');
    limpiarLienzo();

    api
      .get<SalaFiestaResponse>(`/api/fiestas/${salaId}`)
      .then((r) => setSala(r.data))
      .catch(() => {});

    stompService.conectar(sesion.accessToken);
    const desuscribir = stompService.suscribir<PartyEvento>(`/topic/fiesta/${salaId}`, (evento) => {
      if (evento.tipo === 'TICK') {
        relojRef.current = { recibidoEn: performance.now(), msRestantes: evento.msRestantes ?? 0 };
        setMsRestantesVista(evento.msRestantes ?? 0);
        if (!enRondaRef.current) {
          enRondaRef.current = true;
          cargarEstado();
        }
      } else if (evento.tipo === 'RONDA_TERMINADA') {
        enRondaRef.current = false;
        setAviso('¡Ronda terminada! El anfitrión puede iniciar otra.');
        setTimeout(() => setAviso(null), 4000);
        cargarEstado();
      } else if (evento.tipo === 'BORRADOR_DISPONIBLE') {
        setPropietarioBorrador(null);
      } else if (evento.tipo === 'BORRADOR_TOMADO') {
        setPropietarioBorrador(evento.propietarioBorrador);
      } else if (evento.tipo === 'BORRADOR_LIBERADO') {
        setPropietarioBorrador(null);
      } else if (evento.tipo === 'TRAZO' && evento.trazo) {
        if (secuenciasVistasRef.current.has(evento.trazo.secuencia)) return;
        secuenciasVistasRef.current.add(evento.trazo.secuencia);
        dibujarTrazoParty(evento.trazo);
      }
    });

    cargarEstado()
      .catch((err) => setError(extraerMensajeError(err, 'No puedes entrar a esta sala')))
      .finally(() => setCargando(false));

    return desuscribir;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salaId, sesion?.accessToken]);

  // Suaviza la cuenta regresiva entre ticks del servidor (el servidor sigue siendo la fuente de verdad).
  useEffect(() => {
    const intervalo = setInterval(() => {
      const { recibidoEn, msRestantes } = relojRef.current;
      const transcurrido = performance.now() - recibidoEn;
      setMsRestantesVista(Math.max(0, msRestantes - transcurrido));
    }, 100);
    return () => clearInterval(intervalo);
  }, []);

  function coordenadas(e: React.PointerEvent<HTMLCanvasElement>): Punto {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(0.999, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(0.999, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }

  function alPresionar(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!enRonda) return;
    if (modoBorrador && !tengoElBorrador) return;
    puntosActualesRef.current = [coordenadas(e)];
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function alMover(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = ctxRef.current;
    if (!ctx || e.buttons !== 1 || puntosActualesRef.current.length === 0 || !estado) return;
    const punto = coordenadas(e);
    const anterior = puntosActualesRef.current[puntosActualesRef.current.length - 1];
    if (modoBorrador) {
      dibujarBorrado(ctx, [anterior, punto], GROSOR_BORRADOR, ladoPx);
    } else if (estado.pincel) {
      dibujarTrazoCompleto(ctx, { tipoPincel: estado.pincel, colorHex: estado.colorHex ?? '#000', grosor: estado.grosor ?? 20, opacidad: estado.opacidad ?? 1 }, [anterior, punto], ladoPx);
    }
    puntosActualesRef.current.push(punto);
  }

  function alSoltar() {
    const puntos = puntosActualesRef.current;
    puntosActualesRef.current = [];
    if (puntos.length === 0 || !salaId) return;
    const destino = modoBorrador ? `/app/fiesta/${salaId}/borrar` : `/app/fiesta/${salaId}/trazo`;
    stompService.publicar(destino, { puntos });
  }

  async function iniciarRonda() {
    if (!salaId) return;
    try {
      await api.post(`/api/fiestas/${salaId}/rondas`);
    } catch (err) {
      setAviso(extraerMensajeError(err));
      setTimeout(() => setAviso(null), 3000);
    }
  }

  async function tomarBorrador() {
    if (!salaId) return;
    try {
      const { data } = await api.post(`/api/fiestas/${salaId}/borrador`);
      if (data.tomado) {
        setModoBorrador(true);
        setPropietarioBorrador(sesion?.nombreArtista ?? null);
      } else {
        setAviso(`${data.propietarioNombre} tiene el borrador`);
        setTimeout(() => setAviso(null), 3000);
      }
    } catch (err) {
      setAviso(extraerMensajeError(err));
    }
  }

  async function soltarBorrador() {
    if (!salaId) return;
    setModoBorrador(false);
    await api.delete(`/api/fiestas/${salaId}/borrador`).catch(() => {});
  }

  const segundos = Math.ceil(msRestantesVista / 1000);
  const mm = String(Math.floor(segundos / 60)).padStart(2, '0');
  const ss = String(segundos % 60).padStart(2, '0');

  if (error) {
    return (
      <FondoEstudio>
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <p className="text-coral-light">{error}</p>
        <Link to="/fiesta" className="btn-secondary mt-4">
          Volver al lobby
        </Link>
      </div>
      </FondoEstudio>
    );
  }

  return (
    <FondoEstudio>
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label">Modo fiesta</p>
          <h1 className="font-display text-2xl font-semibold">
            Sala de {sala?.anfitrionNombre ?? '…'} {sala && <span className="text-base font-normal text-paper-muted">· {sala.totalParticipantes} en la sala</span>}
          </h1>
        </div>
        <Link to="/fiesta" className="btn-ghost">
          ← Salir de la sala
        </Link>
      </div>

      {sala && (
        <div className="mb-4">
          <CodigoSalaBadge codigo={sala.codigo} />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div
          className={`rounded-2xl border px-5 py-3 font-display text-3xl tabular-nums transition-colors ${
            enRonda ? 'border-teal/50 bg-teal/10 text-teal' : 'border-ink-600 bg-ink-900/50 text-paper-muted'
          }`}
        >
          {enRonda ? `${mm}:${ss}` : '— : —'}
        </div>

        <div className="flex items-center gap-2">
          {estado?.pincel && enRonda && (
            <span className="chip">
              Pincel de la ronda: <strong className="ml-1">{estado.pincel.toLowerCase()}</strong>
              <span className="ml-2 inline-block h-3 w-3 rounded-full" style={{ backgroundColor: estado.colorHex ?? undefined }} />
            </span>
          )}
          {enRonda && (
            <button
              onClick={tengoElBorrador ? soltarBorrador : tomarBorrador}
              className={
                tengoElBorrador
                  ? 'rounded-xl border border-amber bg-amber/15 px-3 py-2 text-sm font-medium text-amber'
                  : 'rounded-xl border border-ink-600 px-3 py-2 text-sm font-medium text-paper-muted hover:border-ink-500'
              }
            >
              {tengoElBorrador ? 'Soltar borrador' : propietarioBorrador ? `Borrador: ${propietarioBorrador}` : 'Tomar el borrador'}
            </button>
          )}
          {esAnfitrion && !enRonda && (
            <button onClick={iniciarRonda} className="btn-primary">
              Iniciar ronda
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {aviso && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-4 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber"
          >
            {aviso}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="card relative mx-auto aspect-square w-full max-w-[640px] overflow-hidden p-0">
        {cargando && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-ink-900/60 backdrop-blur-sm">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber border-t-transparent" />
          </div>
        )}
        {!enRonda && !cargando && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-ink-900/40 backdrop-blur-[2px]">
            <p className="rounded-full bg-ink-900/80 px-4 py-2 text-sm text-paper-muted">
              {esAnfitrion ? 'Presiona "Iniciar ronda" cuando estén listos' : 'Esperando a que el anfitrión inicie la ronda…'}
            </p>
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="h-full w-full touch-none rounded-2xl"
          style={{ cursor: modoBorrador ? (tengoElBorrador ? 'crosshair' : 'not-allowed') : 'crosshair' }}
          onPointerDown={alPresionar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerLeave={alSoltar}
        />
      </div>
    </div>
    </FondoEstudio>
  );
}
