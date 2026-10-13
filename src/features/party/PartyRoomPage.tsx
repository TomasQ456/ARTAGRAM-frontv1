import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { api, extraerMensajeError } from '../../lib/api';
import { stompService } from '../../lib/stompClient';
import { useAuthStore } from '../../lib/authStore';
import { Button } from '../../components/ui/Button';
import { dibujarBorrado, dibujarPunto, dibujarSegmento, dibujarTrazoCompleto, type EstiloPincel } from '../../lib/canvasEngine';
import { BrushToolbar, type Herramienta, type HerramientaFiesta } from '../canvas/BrushToolbar';
import { PublishWizard } from '../feed/PublishWizard';
import { CodigoSalaBadge } from './CodigoSalaBadge';
import { generarUUID } from '../../lib/uuid';
import type { EstadoRondaResponse, PartyEvento, PartyTrazoDto, Punto, SalaFiestaResponse, TipoPincel } from '../../types';

interface TrazoRemotoEnProgreso {
  estilo: EstiloPincel;
  esBorrador: boolean;
  ultimoPunto: Punto | null;
}

export function PartyRoomPage() {
  const { id: salaId } = useParams<{ id: string }>();
  const sesion = useAuthStore((s) => s.sesion);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const dimRef = useRef<{ ancho: number; alto: number }>({ ancho: 1200, alto: 800 });

  const [sala, setSala] = useState<SalaFiestaResponse | null>(null);
  const [estado, setEstado] = useState<EstadoRondaResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);

  // Estados del flujo de rondas y fin de partida
  const [juegoFinalizado, setJuegoFinalizado] = useState(false);
  const [iniciandoRonda, setIniciandoRonda] = useState(false);
  const [previewFinalUrl, setPreviewFinalUrl] = useState<string | null>(null);
  const [totalTrazos, setTotalTrazos] = useState(0);

  // Exclusión mutua de herramientas: solo 1 persona por herramienta a la vez
  const [herramientasTomadas, setHerramientasTomadas] = useState<Record<string, string>>({});
  const [miHerramienta, setMiHerramienta] = useState<HerramientaFiesta | null>(null);
  const [herramientaEstilo, setHerramientaEstilo] = useState<Herramienta>({
    tipoPincel: 'LAPIZ',
    colorHex: '#FF6B57',
    grosor: 20,
    opacidad: 1,
  });

  // Modal para publicar directamente desde el lienzo
  const [modalPublicar, setModalPublicar] = useState(false);
  const [archivoPublicar, setArchivoPublicar] = useState<File | null>(null);

  const trazosRef = useRef<Map<number, PartyTrazoDto>>(new Map());
  const maxSecuenciaRef = useRef(0);
  const propioTrazoRef = useRef<{ id: string; puntos: Punto[]; pendientes: Punto[] } | null>(null);
  const remotosRef = useRef<Map<string, TrazoRemotoEnProgreso>>(new Map());
  const relojRef = useRef<{ recibidoEn: number; msRestantes: number }>({ recibidoEn: 0, msRestantes: 0 });
  const enRondaRef = useRef(false);
  const ultimoEnvioRef = useRef<number>(0);

  const esAnfitrion = !!(sala && sesion && sala.anfitrionNombre === sesion.nombreArtista);
  const enRonda = estado?.estadoSala === 'EN_RONDA';
  const totalRondas = estado?.totalRondas ?? sala?.totalRondas ?? 3;
  const numeroRonda = estado?.numeroRonda ?? sala?.numeroRonda ?? 0;
  const terminado = juegoFinalizado || estado?.estadoSala === 'CERRADA' || (!enRonda && numeroRonda >= totalRondas && numeroRonda > 0);
  const enEsperaInicial = !terminado && !enRonda && numeroRonda === 0;
  const enIntermision = !terminado && !enRonda && numeroRonda > 0 && numeroRonda < totalRondas;

  const redibujarTodo = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const { ancho, alto } = dimRef.current;
    ctx.clearRect(0, 0, ancho, alto);
    ctx.fillStyle = '#F5F1EA';
    ctx.fillRect(0, 0, ancho, alto);
    const ordenados = [...trazosRef.current.values()].sort((a, b) => a.secuencia - b.secuencia);
    for (const t of ordenados) {
      if (t.borrador) {
        dibujarBorrado(ctx, t.puntos, t.grosor || 40, ancho, alto);
      } else if (t.tipoPincel) {
        dibujarTrazoCompleto(
          ctx,
          { tipoPincel: t.tipoPincel, colorHex: t.colorHex ?? '#0B0912', grosor: t.grosor, opacidad: t.opacidad },
          t.puntos,
          ancho,
          alto,
        );
      }
    }
  }, []);

  // Adaptación dinámica del lienzo a la pantalla completa restante
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

  const cargarEstado = useCallback(async () => {
    if (!salaId) return;
    try {
      const { data } = await api.get<EstadoRondaResponse>(`/api/fiestas/${salaId}/estado`);
      setEstado(data);
      enRondaRef.current = data.estadoSala === 'EN_RONDA';
      relojRef.current = { recibidoEn: performance.now(), msRestantes: data.msRestantes };
      const tot = data.totalRondas ?? 3;
      if (data.estadoSala === 'CERRADA' || (data.numeroRonda >= tot && data.estadoSala !== 'EN_RONDA' && data.numeroRonda > 0)) {
        setJuegoFinalizado(true);
      }
      for (const t of data.trazos) {
        trazosRef.current.set(t.secuencia, t);
        maxSecuenciaRef.current = Math.max(maxSecuenciaRef.current, t.secuencia);
      }
      setTotalTrazos(data.trazos.length);
      redibujarTodo();

      // Consultar herramientas tomadas en la sala
      const respHerramientas = await api.get<Record<string, string>>(`/api/fiestas/${salaId}/herramientas`).catch(() => null);
      if (respHerramientas?.data) {
        setHerramientasTomadas(respHerramientas.data);
        const entradaPropia = Object.entries(respHerramientas.data).find(([, autor]) => autor === sesion?.nombreArtista);
        if (entradaPropia) {
          const her = entradaPropia[0] as HerramientaFiesta;
          setMiHerramienta(her);
          if (her !== 'BORRADOR') {
            setHerramientaEstilo((prev) => ({ ...prev, tipoPincel: her as TipoPincel }));
          }
        }
      }
    } catch (err) {
      setError(extraerMensajeError(err, 'No se pudo sincronizar la sala'));
    }
  }, [salaId, redibujarTodo, sesion?.nombreArtista]);

  // Capturar vista previa al finalizar la partida
  useEffect(() => {
    if (terminado && canvasRef.current) {
      try {
        setPreviewFinalUrl(canvasRef.current.toDataURL('image/png'));
        setTotalTrazos(trazosRef.current.size);
      } catch {
        // Ignorar
      }
    }
  }, [terminado]);

  // Conexión en tiempo real vía STOMP
  useEffect(() => {
    if (!salaId || !sesion) return;

    api
      .get<SalaFiestaResponse>(`/api/fiestas/${salaId}`)
      .then((r) => setSala(r.data))
      .catch(() => {});

    stompService.conectar(sesion.accessToken);

    const desuscribir = stompService.suscribir<PartyEvento>(`/topic/fiesta/${salaId}`, (evento) => {
      const ctx = ctxRef.current;
      const { ancho, alto } = dimRef.current;

      if (evento.tipo === 'TICK') {
        relojRef.current = { recibidoEn: performance.now(), msRestantes: evento.msRestantes ?? 0 };
        if (!enRondaRef.current) {
          enRondaRef.current = true;
          cargarEstado();
        }
      } else if (evento.tipo === 'RONDA_TERMINADA') {
        enRondaRef.current = false;
        cargarEstado();
      } else if (evento.tipo === 'JUEGO_TERMINADO') {
        enRondaRef.current = false;
        setJuegoFinalizado(true);
        cargarEstado();
      } else if (evento.tipo === 'HERRAMIENTA_TOMADA' && evento.herramienta && evento.propietarioHerramienta) {
        setHerramientasTomadas((prev) => ({
          ...prev,
          [evento.herramienta!]: evento.propietarioHerramienta!,
        }));
        if (evento.propietarioHerramienta === sesion.nombreArtista) {
          const her = evento.herramienta as HerramientaFiesta;
          setMiHerramienta(her);
          if (her !== 'BORRADOR') {
            setHerramientaEstilo((prev) => ({ ...prev, tipoPincel: her as TipoPincel }));
          }
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
        remotosRef.current.delete(`${evento.trazo.autorId}_party`);
        trazosRef.current.set(evento.trazo.secuencia, evento.trazo);
        maxSecuenciaRef.current = Math.max(maxSecuenciaRef.current, evento.trazo.secuencia);
        if (evento.trazo.autorId !== sesion.usuarioId) {
          redibujarTodo();
        }
      } else if (evento.tipo === 'TRAZO_PARCIAL' && evento.trazo && ctx) {
        // Trazado en progreso en tiempo real de otro participante
        if (evento.trazo.autorId === sesion.usuarioId) return;
        const clave = `${evento.trazo.autorId}_party`;
        let estadoRemoto = remotosRef.current.get(clave);
        if (!estadoRemoto) {
          estadoRemoto = {
            estilo: {
              tipoPincel: (evento.trazo.tipoPincel ?? 'LAPIZ') as TipoPincel,
              colorHex: evento.trazo.colorHex ?? '#0B0912',
              grosor: evento.trazo.grosor,
              opacidad: evento.trazo.opacidad,
            },
            esBorrador: evento.trazo.borrador,
            ultimoPunto: null,
          };
          remotosRef.current.set(clave, estadoRemoto);
        }
        for (const p of evento.trazo.puntos) {
          if (estadoRemoto.ultimoPunto) {
            if (estadoRemoto.esBorrador) {
              dibujarBorrado(ctx, [estadoRemoto.ultimoPunto, p], estadoRemoto.estilo.grosor || 40, ancho, alto);
            } else {
              dibujarSegmento(ctx, estadoRemoto.estilo, estadoRemoto.ultimoPunto, p, ancho, alto);
            }
          } else {
            if (!estadoRemoto.esBorrador) {
              dibujarPunto(ctx, estadoRemoto.estilo, p, ancho, alto);
            }
          }
          estadoRemoto.ultimoPunto = p;
        }
      }
    });

    cargarEstado()
      .catch((err) => setError(extraerMensajeError(err, 'No puedes entrar a esta sala')))
      .finally(() => setCargando(false));

    return desuscribir;
  }, [salaId, sesion, cargarEstado, redibujarTodo]);

  function coordenadas(e: React.PointerEvent<HTMLCanvasElement>): Punto {
    const canvas = canvasRef.current;
    const rect = canvas ? canvas.getBoundingClientRect() : e.currentTarget.getBoundingClientRect();
    const w = rect.width || 1;
    const h = rect.height || 1;
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / w)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / h)),
    };
  }

  function alPresionar(e: React.PointerEvent<HTMLCanvasElement>) {
    if (terminado) {
      setAviso('🎉 La partida ha finalizado. Puedes publicar la obra colaborativa o descargarla.');
      setTimeout(() => setAviso(null), 3500);
      return;
    }
    if (enEsperaInicial) {
      setAviso('⏳ La partida aún no ha comenzado. El anfitrión debe iniciar la primera ronda.');
      setTimeout(() => setAviso(null), 3500);
      return;
    }
    if (!miHerramienta) {
      setAviso('⚠️ Selecciona primero una herramienta disponible en la barra arriba (1 persona por herramienta).');
      setTimeout(() => setAviso(null), 3500);
      return;
    }
    const punto = coordenadas(e);
    const { ancho, alto } = dimRef.current;
    const ctx = ctxRef.current;
    const id = generarUUID();
    propioTrazoRef.current = { id, puntos: [punto], pendientes: [punto] };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    if (ctx) {
      if (miHerramienta === 'BORRADOR') {
        dibujarBorrado(ctx, [punto], herramientaEstilo.grosor || 40, ancho, alto);
      } else {
        dibujarPunto(
          ctx,
          {
            tipoPincel: miHerramienta,
            colorHex: herramientaEstilo.colorHex,
            grosor: herramientaEstilo.grosor,
            opacidad: herramientaEstilo.opacidad,
          },
          punto,
          ancho,
          alto,
        );
      }
    }

    enviarParcial([punto]);
  }

  function alMover(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = ctxRef.current;
    const actual = propioTrazoRef.current;
    if (!ctx || e.buttons !== 1 || !actual || !miHerramienta) return;
    const punto = coordenadas(e);
    const anterior = actual.puntos[actual.puntos.length - 1];
    const { ancho, alto } = dimRef.current;

    if (miHerramienta === 'BORRADOR') {
      dibujarBorrado(ctx, [anterior, punto], herramientaEstilo.grosor || 40, ancho, alto);
    } else {
      dibujarSegmento(
        ctx,
        {
          tipoPincel: miHerramienta,
          colorHex: herramientaEstilo.colorHex,
          grosor: herramientaEstilo.grosor,
          opacidad: herramientaEstilo.opacidad,
        },
        anterior,
        punto,
        ancho,
        alto,
      );
    }
    actual.puntos.push(punto);
    actual.pendientes.push(punto);

    const ahora = performance.now();
    if ((actual.pendientes.length >= 2 || ahora - ultimoEnvioRef.current > 25) && salaId) {
      enviarParcial(actual.pendientes);
      actual.pendientes = [punto];
      ultimoEnvioRef.current = ahora;
    }
  }

  function alSoltar() {
    const actual = propioTrazoRef.current;
    propioTrazoRef.current = null;
    if (!actual || !salaId || !miHerramienta) return;

    if (actual.pendientes.length > 1) {
      enviarParcial(actual.pendientes);
    }

    if (miHerramienta === 'BORRADOR') {
      stompService.publicar(`/app/fiesta/${salaId}/borrar`, {
        puntos: actual.puntos,
        grosor: herramientaEstilo.grosor || 40,
      });
    } else {
      stompService.publicar(`/app/fiesta/${salaId}/trazo`, {
        tipoPincel: miHerramienta,
        colorHex: herramientaEstilo.colorHex,
        grosor: herramientaEstilo.grosor,
        opacidad: herramientaEstilo.opacidad,
        puntos: actual.puntos,
      });
    }
  }

  function enviarParcial(puntos: Punto[]) {
    if (!salaId || !miHerramienta) return;
    stompService.publicar(`/app/fiesta/${salaId}/parcial`, {
      tipoPincel: miHerramienta === 'BORRADOR' ? null : miHerramienta,
      colorHex: herramientaEstilo.colorHex,
      grosor: herramientaEstilo.grosor,
      opacidad: herramientaEstilo.opacidad,
      puntos,
    });
  }

  // Tomar exclusivamente una herramienta o borrador
  async function tomarHerramientaFiesta(tipo: HerramientaFiesta) {
    if (!salaId || !sesion) return;

    // Si ya la tiene, soltarla para liberarla a los compañeros
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
      // Liberar la herramienta anterior si tenía una tomada
      if (miHerramienta) {
        await api.delete(`/api/fiestas/${salaId}/herramientas/${miHerramienta}`).catch(() => {});
      }

      // Bloquear exclusivamente la nueva herramienta
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
        setAviso(`🔒 La herramienta ${tipo} está en uso por ${data.propietarioNombre}`);
        setTimeout(() => setAviso(null), 3500);
      }
    } catch (err) {
      setAviso(extraerMensajeError(err));
      setTimeout(() => setAviso(null), 3500);
    }
  }

  async function iniciarRonda() {
    if (!salaId) return;
    setIniciandoRonda(true);
    try {
      await api.post(`/api/fiestas/${salaId}/rondas`);
    } catch (err) {
      setAviso(extraerMensajeError(err));
      setTimeout(() => setAviso(null), 3000);
    } finally {
      setIniciandoRonda(false);
    }
  }

  // Publicar obra directamente desde la sala fiesta
  function abrirPublicar() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const archivo = new File([blob], `fiesta-${sala?.codigo || 'obra'}-${Date.now()}.png`, { type: 'image/png' });
      setArchivoPublicar(archivo);
      setModalPublicar(true);
    }, 'image/png');
  }

  // Descarga de snapshot PNG
  function descargarSnapshot() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const enlace = document.createElement('a');
    enlace.download = `fiesta-${sala?.codigo || 'obra'}.png`;
    enlace.href = canvas.toDataURL('image/png');
    enlace.click();
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <p className="text-coral-light">{error}</p>
        <Link to="/fiesta" className="btn-secondary mt-4">
          Volver al lobby
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4.5rem)] flex-col bg-ink-950 p-2 sm:p-3 gap-2 overflow-hidden select-none">
      {/* Cabecera del modo fiesta */}
      <header className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-3">
          <Link
            to="/fiesta"
            className="btn-ghost text-xs px-2.5 py-1.5 flex items-center gap-1 border border-ink-800"
            title="Salir de la sala"
          >
            ← Salir
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-lg font-bold tracking-tight text-paper">
                Sala de {sala?.anfitrionNombre ?? '…'}
              </h1>
              {sala && <CodigoSalaBadge codigo={sala.codigo} />}
              <span className="rounded-full bg-violet/20 border border-violet/40 px-2 py-0.5 text-[10px] font-semibold text-violet-300">
                🎉 Modo Fiesta · {sala?.totalParticipantes ?? 1} artista(s)
              </span>
            </div>
            <p className="text-[11px] text-paper-dim hidden sm:block">
              Panel estilo Paint exclusivo · 1 persona por herramienta en tiempo real
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Cronómetro aislado que no re-renderiza el lienzo ni la página */}
          <CronometroRonda
            relojRef={relojRef}
            enRonda={enRonda}
            numeroRonda={numeroRonda}
            totalRondas={totalRondas}
            terminado={terminado}
          />

          {esAnfitrion && !terminado && (
            <Button
              type="button"
              onClick={iniciarRonda}
              cargando={iniciandoRonda}
              className="text-xs px-2.5 py-1.5 border border-ink-700 bg-gradient-to-r from-coral to-violet text-white hover:brightness-110 shadow-sm"
              title="Iniciar o avanzar a la siguiente ronda"
            >
              {enEsperaInicial
                ? `🚀 Iniciar Ronda 1/${totalRondas}`
                : enIntermision
                ? `▶ Ronda ${numeroRonda + 1}/${totalRondas}`
                : 'Reiniciar ronda'}
            </Button>
          )}

          <button
            type="button"
            onClick={descargarSnapshot}
            className="btn-ghost text-xs px-2.5 py-1.5 border border-ink-800 text-paper-muted hover:text-paper"
            title="Descargar snapshot PNG"
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

      {/* Alerta de notificación o estado de herramientas */}
      <AnimatePresence>
        {aviso && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-lg border border-amber/40 bg-amber/10 px-3 py-1.5 text-xs text-amber flex items-center justify-between"
          >
            <span>{aviso}</span>
            <button type="button" onClick={() => setAviso(null)} className="text-amber/70 hover:text-amber ml-2">
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Panel horizontal Paint permanente (con exclusividad de 1 persona por herramienta) */}
      <BrushToolbar
        herramienta={herramientaEstilo}
        onCambiar={setHerramientaEstilo}
        modoFiesta={true}
        herramientasTomadas={herramientasTomadas}
        usuarioActualNombre={sesion?.nombreArtista}
        herramientaActivaFiesta={miHerramienta}
        onTomarHerramienta={tomarHerramientaFiesta}
        deshabilitado={false}
        orientacion="horizontal"
        onPublicar={abrirPublicar}
      />

      {/* Contenedor responsivo con la forma de la pantalla para el lienzo colaborativo de fiesta */}
      <div
        ref={containerRef}
        className="relative flex-1 w-full min-h-0 rounded-2xl border border-ink-800 bg-[#F5F1EA] shadow-inner overflow-hidden"
        style={{ cursor: miHerramienta ? 'crosshair' : 'default' }}
      >
        {cargando && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-ink-900/60 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2 text-paper">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber border-t-transparent" />
              <p className="text-xs text-paper-muted">Sincronizando sala fiesta…</p>
            </div>
          </div>
        )}

        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none select-none"
          style={{ cursor: miHerramienta ? 'crosshair' : 'default' }}
          onPointerDown={alPresionar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerLeave={alSoltar}
        />

        {/* Pantalla de inicio / sala de espera previa a la primera ronda */}
        {enEsperaInicial && !cargando && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-ink-950/70 p-4 backdrop-blur-sm text-center">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="card max-w-sm w-full p-6 flex flex-col items-center gap-4 border-violet/30 shadow-2xl bg-ink-900/95"
            >
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-coral to-violet flex items-center justify-center text-3xl shadow-lg shadow-coral/20">
                🎉
              </div>
              <div>
                <h2 className="font-display text-xl font-bold text-paper">Sala de Espera</h2>
                <p className="text-xs text-paper-dim mt-1">
                  Código: <span className="font-mono font-bold text-violet">{sala?.codigo}</span>
                </p>
              </div>

              <div className="w-full rounded-xl bg-ink-950/80 p-3 text-xs text-paper-muted space-y-2 border border-ink-800">
                <div className="flex justify-between items-center">
                  <span>Total de rondas:</span>
                  <span className="font-bold text-paper px-2 py-0.5 rounded bg-ink-800 border border-ink-700">
                    {totalRondas} rondas
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Tiempo por ronda:</span>
                  <span className="font-semibold text-paper">{sala?.duracionRondaSegundos ?? 60}s</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Participantes:</span>
                  <span className="font-semibold text-paper">
                    {sala?.totalParticipantes ?? 1} / {sala?.cupoMaximo ?? 8}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Anfitrión:</span>
                  <span className="font-semibold text-paper">{sala?.anfitrionNombre}</span>
                </div>
              </div>

              {esAnfitrion ? (
                <Button
                  type="button"
                  onClick={iniciarRonda}
                  cargando={iniciandoRonda}
                  className="w-full py-2.5 text-xs font-bold bg-gradient-to-r from-coral to-violet shadow-lg shadow-coral/30"
                >
                  🚀 Iniciar Partida (Ronda 1 de {totalRondas})
                </Button>
              ) : (
                <div className="flex items-center gap-2 text-xs text-amber animate-pulse">
                  <span>⏳</span>
                  <span>Esperando a que {sala?.anfitrionNombre} inicie la ronda 1...</span>
                </div>
              )}
            </motion.div>
          </div>
        )}

        {/* Banner de intermisión entre rondas */}
        {enIntermision && !cargando && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center">
            <motion.div
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="card px-5 py-3 flex items-center gap-4 border-amber/40 bg-ink-950/95 shadow-2xl backdrop-blur-md"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">⏸</span>
                  <span className="text-xs font-bold text-amber">
                    ¡Ronda {numeroRonda} de {totalRondas} finalizada!
                  </span>
                </div>
                <p className="text-[11px] text-paper-dim">Prepara tu próximo trazo con tu herramienta asignada.</p>
              </div>
              {esAnfitrion ? (
                <Button
                  type="button"
                  onClick={iniciarRonda}
                  cargando={iniciandoRonda}
                  className="text-xs py-1.5 px-3 whitespace-nowrap bg-gradient-to-r from-coral to-violet"
                >
                  ▶ Ronda {numeroRonda + 1} de {totalRondas}
                </Button>
              ) : (
                <span className="text-xs text-paper-dim animate-pulse whitespace-nowrap">
                  Esperando al anfitrión...
                </span>
              )}
            </motion.div>
          </div>
        )}

        {/* Pantalla final de la partida al completar todas las rondas */}
        {terminado && !cargando && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-ink-950/90 p-4 backdrop-blur-md overflow-y-auto">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="card max-w-lg w-full p-6 flex flex-col items-center gap-4 border-violet/40 shadow-2xl text-center bg-ink-900/95"
            >
              <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-coral to-violet flex items-center justify-center text-3xl shadow-lg shadow-violet/30">
                🎉
              </div>
              <div>
                <h2 className="font-display text-2xl font-bold text-paper">¡Partida Finalizada!</h2>
                <p className="text-xs text-paper-dim mt-1">
                  Se completaron las <span className="text-paper font-semibold">{totalRondas} rondas</span> colaborativas.
                </p>
              </div>

              {/* Vista previa de la obra completada */}
              <div className="w-full max-h-56 overflow-hidden rounded-xl border border-ink-700 bg-[#F5F1EA] shadow-inner flex items-center justify-center p-1">
                {previewFinalUrl ? (
                  <img
                    src={previewFinalUrl}
                    alt="Obra colaborativa final"
                    className="max-h-52 object-contain rounded-lg shadow-sm"
                  />
                ) : (
                  <div className="h-40 flex items-center justify-center text-xs text-paper-dim">
                    Lienzo colaborativo finalizado
                  </div>
                )}
              </div>

              {/* Estadísticas de la partida */}
              <div className="grid grid-cols-3 gap-2 w-full text-xs">
                <div className="rounded-lg bg-ink-950 p-2.5 border border-ink-800">
                  <p className="text-paper-dim text-[10px]">Rondas</p>
                  <p className="font-bold text-paper text-sm">{totalRondas} / {totalRondas}</p>
                </div>
                <div className="rounded-lg bg-ink-950 p-2.5 border border-ink-800">
                  <p className="text-paper-dim text-[10px]">Trazos hechos</p>
                  <p className="font-bold text-paper text-sm">{totalTrazos}</p>
                </div>
                <div className="rounded-lg bg-ink-950 p-2.5 border border-ink-800">
                  <p className="text-paper-dim text-[10px]">Artistas</p>
                  <p className="font-bold text-paper text-sm">{sala?.totalParticipantes ?? 1}</p>
                </div>
              </div>

              {/* Botones de acción principales */}
              <div className="flex flex-col sm:flex-row gap-2 w-full pt-2">
                <Button
                  type="button"
                  onClick={abrirPublicar}
                  className="flex-1 py-2 text-xs font-semibold bg-gradient-to-r from-coral to-violet shadow-lg shadow-coral/30"
                >
                  🎨 Publicar en el Feed
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={descargarSnapshot}
                  className="flex-1 py-2 text-xs border-ink-700 hover:border-paper"
                >
                  📥 Descargar PNG
                </Button>
              </div>

              <Link
                to="/fiesta"
                className="text-xs text-paper-dim hover:text-paper underline transition-colors pt-1"
              >
                Volver al lobby del Modo Fiesta
              </Link>
            </motion.div>
          </div>
        )}

        {/* Indicador de ayuda si no tiene herramienta seleccionada */}
        {!miHerramienta && !cargando && !enEsperaInicial && !terminado && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none rounded-full bg-ink-900/80 px-4 py-1.5 text-xs text-paper-dim border border-ink-700/80 shadow-md backdrop-blur-sm">
            👆 Elige una de las herramientas disponibles arriba para comenzar a pintar
          </div>
        )}
      </div>

      {/* Modal para publicar obra directamente desde el modo fiesta */}
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

function CronometroRonda({
  relojRef,
  enRonda,
  numeroRonda,
  totalRondas,
  terminado,
}: {
  relojRef: React.RefObject<{ recibidoEn: number; msRestantes: number }>;
  enRonda: boolean;
  numeroRonda: number;
  totalRondas: number;
  terminado: boolean;
}) {
  const [ms, setMs] = useState(0);

  useEffect(() => {
    if (!enRonda) return;
    const actualizar = () => {
      const { recibidoEn, msRestantes } = relojRef.current;
      const transcurrido = performance.now() - recibidoEn;
      setMs(Math.max(0, msRestantes - transcurrido));
    };
    actualizar();
    const intervalo = setInterval(actualizar, 200);
    return () => clearInterval(intervalo);
  }, [enRonda, relojRef]);

  if (terminado) {
    return (
      <div className="rounded-xl border border-violet/50 bg-violet/15 px-3 py-1 font-display text-xs font-semibold text-violet-300">
        🏆 Partida finalizada ({totalRondas}/{totalRondas})
      </div>
    );
  }

  if (!enRonda) {
    if (numeroRonda === 0) {
      return (
        <div className="rounded-xl border border-ink-700 bg-ink-900/60 px-3 py-1 font-display text-xs font-semibold text-paper-dim">
          ⏳ Esperando inicio · 0/{totalRondas} rondas
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-amber/40 bg-amber/15 px-3 py-1 font-display text-xs font-semibold text-amber">
        ⏸ Ronda {numeroRonda}/{totalRondas}
      </div>
    );
  }

  const segundos = Math.ceil(ms / 1000);
  const mm = String(Math.floor(segundos / 60)).padStart(2, '0');
  const ss = String(segundos % 60).padStart(2, '0');

  return (
    <div className="rounded-xl border border-teal/50 bg-teal/15 px-3 py-1 font-display text-xs font-semibold tabular-nums text-teal">
      ⏱ {mm}:{ss} · Ronda {numeroRonda}/{totalRondas}
    </div>
  );
}
