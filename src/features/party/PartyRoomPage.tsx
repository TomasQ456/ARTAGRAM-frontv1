import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { api, extraerMensajeError } from '../../lib/api';
import { stompService } from '../../lib/stompClient';
import { useAuthStore } from '../../lib/authStore';
import { FondoEstudio } from '../../components/layout/FondoEstudio';
import { dibujarBorrado, dibujarTrazoCompleto } from '../../lib/canvasEngine';
import { BrushToolbar, type Herramienta, type HerramientaFiesta } from '../canvas/BrushToolbar';
import { CodigoSalaBadge } from './CodigoSalaBadge';
import type { EstadoRondaResponse, PartyEvento, PartyTrazoDto, Punto, SalaFiestaResponse, TipoPincel } from '../../types';

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
  const [aviso, setAviso] = useState<string | null>(null);

  // Exclusión mutua de herramientas: solo 1 persona por herramienta
  const [herramientasTomadas, setHerramientasTomadas] = useState<Record<string, string>>({});
  const [miHerramienta, setMiHerramienta] = useState<HerramientaFiesta | null>(null);
  const [herramientaEstilo, setHerramientaEstilo] = useState<Herramienta>({
    tipoPincel: 'LAPIZ',
    colorHex: '#FF6B57',
    grosor: 20,
    opacidad: 1,
  });

  const secuenciasVistasRef = useRef<Set<number>>(new Set());
  const puntosActualesRef = useRef<Punto[]>([]);
  const relojRef = useRef<{ recibidoEn: number; msRestantes: number }>({ recibidoEn: 0, msRestantes: 0 });
  const enRondaRef = useRef(false);

  const esAnfitrion = sala && sesion && sala.anfitrionNombre === sesion.nombreArtista;
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
      dibujarTrazoCompleto(
        ctx,
        { tipoPincel: t.tipoPincel, colorHex: t.colorHex ?? '#000', grosor: t.grosor, opacidad: t.opacidad },
        t.puntos,
        ladoPx,
      );
    }
  }, []);

  const cargarEstado = useCallback(async () => {
    if (!salaId) return;
    try {
      const { data } = await api.get<EstadoRondaResponse>(`/api/fiestas/${salaId}/estado`);
      setEstado(data);
      enRondaRef.current = data.estadoSala === 'EN_RONDA';
      relojRef.current = { recibidoEn: performance.now(), msRestantes: data.msRestantes };
      setMsRestantesVista(data.msRestantes);
      secuenciasVistasRef.current = new Set(data.trazos.map((t) => t.secuencia));
      limpiarLienzo();
      for (const t of data.trazos) dibujarTrazoParty(t);

      // Cargar herramientas tomadas en la sala
      const respHerramientas = await api.get<Record<string, string>>(`/api/fiestas/${salaId}/herramientas`).catch(() => null);
      if (respHerramientas?.data) {
        setHerramientasTomadas(respHerramientas.data);
        // Si el usuario actual ya posee una herramienta registrada
        const entradaPropia = Object.entries(respHerramientas.data).find(([, autor]) => autor === sesion?.nombreArtista);
        if (entradaPropia) {
          setMiHerramienta(entradaPropia[0] as HerramientaFiesta);
        }
      }
    } catch (err) {
      setError(extraerMensajeError(err, 'No se pudo sincronizar la sala'));
    }
  }, [salaId, dibujarTrazoParty, sesion?.nombreArtista]);

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
      } else if (evento.tipo === 'HERRAMIENTA_TOMADA' && evento.herramienta && evento.propietarioHerramienta) {
        setHerramientasTomadas((prev) => ({
          ...prev,
          [evento.herramienta!]: evento.propietarioHerramienta!,
        }));
        if (evento.propietarioHerramienta === sesion.nombreArtista) {
          setMiHerramienta(evento.herramienta as HerramientaFiesta);
        }
      } else if (evento.tipo === 'HERRAMIENTA_LIBERADA' && evento.herramienta) {
        setHerramientasTomadas((prev) => {
          const copia = { ...prev };
          delete copia[evento.herramienta!];
          return copia;
        });
        setMiHerramienta((actual) => (actual === evento.herramienta ? null : actual));
      } else if (evento.tipo === 'BORRADOR_TOMADO') {
        setHerramientasTomadas((prev) => ({
          ...prev,
          BORRADOR: evento.propietarioBorrador ?? 'alguien',
        }));
        if (evento.propietarioBorrador === sesion.nombreArtista) {
          setMiHerramienta('BORRADOR');
        }
      } else if (evento.tipo === 'BORRADOR_LIBERADO') {
        setHerramientasTomadas((prev) => {
          const copia = { ...prev };
          delete copia.BORRADOR;
          return copia;
        });
        setMiHerramienta((actual) => (actual === 'BORRADOR' ? null : actual));
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
  }, [salaId, sesion?.accessToken, cargarEstado]);

  // Suaviza la cuenta regresiva entre ticks del servidor
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
    if (!miHerramienta) {
      setAviso('Debes tomar una de las herramientas disponibles arriba antes de dibujar.');
      setTimeout(() => setAviso(null), 3000);
      return;
    }
    puntosActualesRef.current = [coordenadas(e)];
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function alMover(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = ctxRef.current;
    if (!ctx || e.buttons !== 1 || puntosActualesRef.current.length === 0 || !miHerramienta) return;
    const punto = coordenadas(e);
    const anterior = puntosActualesRef.current[puntosActualesRef.current.length - 1];

    if (miHerramienta === 'BORRADOR') {
      dibujarBorrado(ctx, [anterior, punto], GROSOR_BORRADOR, ladoPx);
    } else {
      dibujarTrazoCompleto(
        ctx,
        {
          tipoPincel: miHerramienta,
          colorHex: herramientaEstilo.colorHex,
          grosor: herramientaEstilo.grosor,
          opacidad: herramientaEstilo.opacidad,
        },
        [anterior, punto],
        ladoPx,
      );
    }
    puntosActualesRef.current.push(punto);
  }

  function alSoltar() {
    const puntos = puntosActualesRef.current;
    puntosActualesRef.current = [];
    if (puntos.length === 0 || !salaId || !miHerramienta) return;

    if (miHerramienta === 'BORRADOR') {
      stompService.publicar(`/app/fiesta/${salaId}/borrar`, { puntos });
    } else {
      stompService.publicar(`/app/fiesta/${salaId}/trazo`, {
        tipoPincel: miHerramienta,
        colorHex: herramientaEstilo.colorHex,
        grosor: herramientaEstilo.grosor,
        opacidad: herramientaEstilo.opacidad,
        puntos,
      });
    }
  }

  // Tomar exclusivamente una herramienta o borrador
  async function tomarHerramientaFiesta(tipo: HerramientaFiesta) {
    if (!salaId || !sesion) return;

    // Si ya la tiene, soltarla para que otro la pueda usar
    if (miHerramienta === tipo) {
      try {
        await api.delete(`/api/fiestas/${salaId}/herramientas/${tipo}`);
        setMiHerramienta(null);
        setHerramientasTomadas((prev) => {
          const copia = { ...prev };
          delete copia[tipo];
          return copia;
        });
      } catch (err) {
        setAviso(extraerMensajeError(err));
      }
      return;
    }

    try {
      // Liberar la herramienta anterior si tenía una
      if (miHerramienta) {
        await api.delete(`/api/fiestas/${salaId}/herramientas/${miHerramienta}`).catch(() => {});
      }

      // Adquirir la nueva herramienta seleccionada
      const { data } = await api.post<{ tomado: boolean; herramienta: string; propietarioNombre: string }>(
        `/api/fiestas/${salaId}/herramientas/${tipo}`,
      );

      if (data.tomado) {
        setMiHerramienta(tipo);
        setHerramientasTomadas((prev) => ({ ...prev, [tipo]: sesion.nombreArtista }));
        if (tipo !== 'BORRADOR') {
          setHerramientaEstilo((prev) => ({ ...prev, tipoPincel: tipo as TipoPincel }));
        }
      } else {
        setAviso(`La herramienta ${tipo} está en uso por ${data.propietarioNombre}`);
        setTimeout(() => setAviso(null), 3500);
      }
    } catch (err) {
      setAviso(extraerMensajeError(err));
      setTimeout(() => setAviso(null), 3500);
    }
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
              Sala de {sala?.anfitrionNombre ?? '…'}{' '}
              {sala && <span className="text-base font-normal text-paper-muted">· {sala.totalParticipantes} en la sala</span>}
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
            {miHerramienta ? (
              <span className="chip border-emerald-500/40 bg-emerald-500/15 text-emerald-300">
                Tu herramienta activa: <strong className="ml-1 uppercase">{miHerramienta}</strong>
              </span>
            ) : (
              <span className="chip text-paper-dim">
                Elige una herramienta disponible en el panel
              </span>
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
              className="mb-4 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber flex items-center justify-between"
            >
              <span>{aviso}</span>
              <button type="button" onClick={() => setAviso(null)} className="text-amber/70 hover:text-amber ml-2">
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Panel de herramientas permanente estilo Paint (con exclusividad de 1 persona por herramienta) */}
        <div className="mb-4 w-full">
          <BrushToolbar
            herramienta={herramientaEstilo}
            onCambiar={setHerramientaEstilo}
            modoFiesta={true}
            herramientasTomadas={herramientasTomadas}
            usuarioActualNombre={sesion?.nombreArtista}
            herramientaActivaFiesta={miHerramienta}
            onTomarHerramienta={tomarHerramientaFiesta}
            deshabilitado={!enRonda}
            orientacion="horizontal"
          />
        </div>

        {/* Lienzo del modo fiesta */}
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
            style={{ cursor: miHerramienta ? 'crosshair' : 'not-allowed' }}
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
