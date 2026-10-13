import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, extraerMensajeError } from '../../lib/api';
import { stompService } from '../../lib/stompClient';
import { useAuthStore } from '../../lib/authStore';
import { anchoDeLineaPx, dibujarPunto, dibujarSegmento, dibujarTrazoCompleto, type EstiloPincel } from '../../lib/canvasEngine';
import { BrushToolbar, type Herramienta } from './BrushToolbar';
import { PublishWizard } from '../feed/PublishWizard';
import { generarUUID } from '../../lib/uuid';
import {
  anclaOpuesta,
  cajaDe,
  distanciaAlTrazoPx,
  escalar,
  esquinaDe,
  factorDeEscala,
  mover,
  type Esquina,
} from '../../lib/trazoGeometria';
import { CajaSeleccion } from './CajaSeleccion';
import type { BloqueoEvento, BloqueoTrazoResponse, ComunidadResponse, Punto, TrazoDto, TrazoEvento } from '../../types';

interface TrazoRemotoEnProgreso {
  estilo: EstiloPincel;
  puntos: Punto[];
  ultimoPunto: Punto | null;
}

interface TrazoLocalPendiente {
  id: string;
  estilo: EstiloPincel;
  puntos: Punto[];
  capa: number;
  creadoEn: number;
}

/** Trazo que tengo bloqueado (HU-15) y que estoy escalando o moviendo con la caja. */
interface SeleccionTrazo {
  trazo: TrazoDto;
  puntos: Punto[];
}

type Arrastre =
  | { tipo: 'escala'; ancla: Punto; esquinaOriginal: Punto; puntosIniciales: Punto[] }
  | { tipo: 'mover'; inicio: Punto; puntosIniciales: Punto[] };

/** El bloqueo vence a los 30 s en el backend: se renueva bastante antes. */
const HEARTBEAT_BLOQUEO_MS = 10_000;
/** Durante el arrastre se envia la edicion como mucho cada tanto, para que los demas la vean en vivo. */
const INTERVALO_EDICION_EN_VIVO_MS = 120;

interface TrazoPropioActivo {
  id: string;
  estilo: EstiloPincel;
  puntos: Punto[];
  pendientes: Punto[];
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
  const [modoEditar, setModoEditar] = useState(false);
  // La seleccion vive en un ref (la leen el redibujado y los handlers de arrastre);
  // forzarRender actualiza la caja en pantalla cuando cambia.
  const seleccionRef = useRef<SeleccionTrazo | null>(null);
  const [, forzarRender] = useReducer((x: number) => x + 1, 0);
  const bloqueosAjenosRef = useRef<Map<string, string>>(new Map());
  const arrastreRef = useRef<Arrastre | null>(null);
  const edicionEnVueloRef = useRef(false);
  const edicionPendienteRef = useRef<Punto[] | null>(null);
  const ultimaEdicionRef = useRef(0);

  // Cursores remotos en tiempo real con nombre
  const [cursoresRemotos, setCursoresRemotos] = useState<
    Record<string, { autorId: string; autorNombre: string; colorHex: string; tipoPincel: string; x: number; y: number; actualizadoEn: number }>
  >({});

  // Estado para el modal de publicación directa desde el lienzo
  const [modalPublicar, setModalPublicar] = useState(false);
  const [archivoPublicar, setArchivoPublicar] = useState<File | null>(null);

  const trazosRef = useRef<Map<number, TrazoDto>>(new Map());
  const maxSecuenciaRef = useRef(0);
  const propioTrazoRef = useRef<TrazoPropioActivo | null>(null);
  const trazosLocalesPendientesRef = useRef<Map<string, TrazoLocalPendiente>>(new Map());
  const remotosRef = useRef<Map<string, TrazoRemotoEnProgreso>>(new Map());
  const redibujadoProgramadoRef = useRef(false);
  const ultimoEnvioRef = useRef<number>(0);

  // Limpieza automática de cursores remotos inactivos
  useEffect(() => {
    const timer = setInterval(() => {
      const ahora = Date.now();
      setCursoresRemotos((prev) => {
        let cambiado = false;
        const copia: Record<string, { autorId: string; autorNombre: string; colorHex: string; tipoPincel: string; x: number; y: number; actualizadoEn: number }> = {};
        for (const [id, c] of Object.entries(prev)) {
          if (ahora - c.actualizadoEn <= 2200) {
            copia[id] = c;
          } else {
            cambiado = true;
          }
        }
        return cambiado ? copia : prev;
      });
    }, 400);
    return () => clearInterval(timer);
  }, []);

  const redibujarTodo = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const { ancho, alto } = dimRef.current;
    ctx.clearRect(0, 0, ancho, alto);
    ctx.fillStyle = '#F5F1EA';
    ctx.fillRect(0, 0, ancho, alto);

    // 1. Trazos confirmados del servidor
    const ordenados = [...trazosRef.current.values()].sort((a, b) => a.secuencia - b.secuencia);
    const seleccion = seleccionRef.current;
    for (const t of ordenados) {
      if (seleccion && seleccion.trazo.id === t.id) continue;
      dibujarTrazoCompleto(
        ctx,
        { tipoPincel: t.tipoPincel, colorHex: t.colorHex, grosor: t.grosor, opacidad: t.opacidad },
        t.puntos,
        ancho,
        alto,
      );
    }

    // 2. Trazos locales pendientes de confirmación del servidor (in-flight optimistas)
    for (const p of trazosLocalesPendientesRef.current.values()) {
      dibujarTrazoCompleto(ctx, p.estilo, p.puntos, ancho, alto);
    }

    // 3. Trazos remotos en progreso de otros usuarios
    for (const r of remotosRef.current.values()) {
      if (r.puntos.length > 0) {
        dibujarTrazoCompleto(ctx, r.estilo, r.puntos, ancho, alto);
      }
    }

    // 4. Trazo propio actualmente en trazado (mientras arrastra el puntero)
    const propio = propioTrazoRef.current;
    if (propio && propio.puntos.length > 0) {
      dibujarTrazoCompleto(ctx, propio.estilo, propio.puntos, ancho, alto);
    }

    // 5. Trazo seleccionado, con su estilo original y la geometria que se le esta aplicando
    if (seleccion) {
      const t = seleccion.trazo;
      dibujarTrazoCompleto(
        ctx,
        { tipoPincel: t.tipoPincel, colorHex: t.colorHex, grosor: t.grosor, opacidad: t.opacidad },
        seleccion.puntos,
        ancho,
        alto,
      );
    }
  }, []);

  const solicitarRedibujado = useCallback(() => {
    if (redibujadoProgramadoRef.current) return;
    redibujadoProgramadoRef.current = true;
    requestAnimationFrame(() => {
      redibujadoProgramadoRef.current = false;
      redibujarTodo();
    });
  }, [redibujarTodo]);

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
    // No se puede deducir del contenido: un lienzo vacio tambien tiene 0 trazos
    // despues de cargar el snapshot, y sus eventos quedarian en el buffer para siempre.
    let snapshotCargado = false;
    const bufferMensajes: TrazoEvento[] = [];

    api
      .get<ComunidadResponse>(`/api/comunidades/${comunidadId}`)
      .then((r) => activo && setComunidad(r.data))
      .catch((err) => activo && setErrorAcceso(extraerMensajeError(err, 'No puedes entrar a este lienzo')));

    stompService.conectar(sesion.accessToken);

    const desuscribirTrazos = stompService.suscribir<TrazoEvento>(`/topic/lienzo/${comunidadId}`, (evento) => {
      if (!activo) return;
      if (!snapshotCargado) {
        // Todavía no llegó el snapshot inicial: almacenar para procesar en orden
        bufferMensajes.push(evento);
        return;
      }
      procesarEvento(evento);
    });

    const desuscribirBloqueos = stompService.suscribir<BloqueoEvento>(`/topic/lienzo/${comunidadId}/bloqueos`, (evento) => {
      if (!activo) return;
      if (evento.tipo === 'TOMADO') {
        if (evento.propietarioNombre === sesion?.nombreArtista) return;
        bloqueosAjenosRef.current.set(evento.trazoId, evento.propietarioNombre ?? 'Alguien');
        setAviso(`${evento.propietarioNombre} está editando un trazo`);
        setTimeout(() => setAviso(null), 3000);
      } else {
        bloqueosAjenosRef.current.delete(evento.trazoId);
      }
      forzarRender();
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
        snapshotCargado = true;
        for (const evento of bufferMensajes) {
          if (evento.tipo === 'FINAL' && evento.secuencia && evento.secuencia <= maxSecuenciaRef.current) {
            continue;
          }
          procesarEvento(evento);
        }
        bufferMensajes.length = 0;
      })
      .catch(() => {
        // Sin snapshot no hay orden que proteger: procesar en vivo de todos modos
        snapshotCargado = true;
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
            id: evento.trazoId ?? evento.trazoEnProgresoId ?? generarUUID(),
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
        if (evento.trazoEnProgresoId) {
          remotosRef.current.delete(evento.trazoEnProgresoId);
          trazosLocalesPendientesRef.current.delete(evento.trazoEnProgresoId);
        }
        setCursoresRemotos((prev) => {
          if (!prev[evento.autorId]) return prev;
          const copia = { ...prev };
          delete copia[evento.autorId];
          return copia;
        });
        // Siempre redibujar para asegurar que todos vean exactamente la misma versión y composición
        solicitarRedibujado();
        return;
      }

      if (evento.tipo === 'EDITADO') {
        if (evento.secuencia != null) {
          const anterior = trazosRef.current.get(evento.secuencia);
          trazosRef.current.set(evento.secuencia, {
            id: evento.trazoId ?? anterior?.id ?? generarUUID(),
            secuencia: evento.secuencia,
            autorId: evento.autorId,
            autorNombre: evento.autorNombre,
            tipoPincel: evento.tipoPincel,
            colorHex: evento.colorHex,
            grosor: evento.grosor,
            opacidad: evento.opacidad,
            capa: evento.capa,
            puntos: evento.puntos,
            creadoEn: anterior?.creadoEn ?? new Date().toISOString(),
          });
        }
        solicitarRedibujado();
        forzarRender(); // la caja de bloqueo ajena sigue al trazo si lo escalan
        return;
      }

      // Trazo en progreso recibido en tiempo real de otro usuario
      if (esPropio || !evento.trazoEnProgresoId) return;

      if (evento.puntos && evento.puntos.length > 0) {
        const ultimoPunto = evento.puntos[evento.puntos.length - 1];
        setCursoresRemotos((prev) => ({
          ...prev,
          [evento.autorId]: {
            autorId: evento.autorId,
            autorNombre: evento.autorNombre || 'Artista',
            colorHex: evento.colorHex || '#FF6B57',
            tipoPincel: evento.tipoPincel || 'Pincel',
            x: ultimoPunto.x,
            y: ultimoPunto.y,
            actualizadoEn: Date.now(),
          },
        }));
      }

      const clave = evento.trazoEnProgresoId;
      let estado = remotosRef.current.get(clave);
      if (!estado) {
        estado = {
          estilo: { tipoPincel: evento.tipoPincel, colorHex: evento.colorHex, grosor: evento.grosor, opacidad: evento.opacidad },
          puntos: [],
          ultimoPunto: null,
        };
        remotosRef.current.set(clave, estado);
      }

      for (const punto of evento.puntos) {
        estado.puntos.push(punto);
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
  }, [comunidadId, sesion?.accessToken, solicitarRedibujado]);

  function coordenadasRelativas(e: React.PointerEvent<HTMLCanvasElement>): Punto {
    const canvas = canvasRef.current;
    const rect = canvas ? canvas.getBoundingClientRect() : e.currentTarget.getBoundingClientRect();
    const w = rect.width || 1;
    const h = rect.height || 1;
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / w)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / h)),
    };
  }

  function coordenadasDesdeCliente(clientX: number, clientY: number): Punto {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / (rect.width || 1))),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / (rect.height || 1))),
    };
  }

  function trazoBajoElPuntero(punto: Punto): TrazoDto | null {
    const { ancho, alto } = dimRef.current;
    let mejor: TrazoDto | null = null;
    let mejorDistancia = Infinity;
    for (const trazo of trazosRef.current.values()) {
      // Tolerancia: unos px alrededor del borde visible del trazo
      const tolerancia = 10 + (trazo.grosor / 100) * Math.min(ancho, alto) * 0.4;
      const d = distanciaAlTrazoPx(trazo.puntos, punto, ancho, alto);
      if (d <= tolerancia && d < mejorDistancia) {
        mejorDistancia = d;
        mejor = trazo;
      }
    }
    return mejor;
  }

  async function seleccionarEn(punto: Punto) {
    if (!comunidadId) return;
    const trazo = trazoBajoElPuntero(punto);
    const actual = seleccionRef.current;
    if (actual && trazo?.id === actual.trazo.id) return;
    await liberarSeleccion();
    if (!trazo) return;

    const duenoAjeno = bloqueosAjenosRef.current.get(trazo.id);
    if (duenoAjeno) {
      setAviso(`🔒 ${duenoAjeno} está editando ese trazo. Espera a que lo suelte.`);
      return;
    }
    try {
      await api.post<BloqueoTrazoResponse>(`/api/comunidades/${comunidadId}/lienzo/trazos/${trazo.id}/bloqueo`);
      seleccionRef.current = { trazo, puntos: trazo.puntos };
      setAviso(null);
      forzarRender();
      solicitarRedibujado();
    } catch (err) {
      const dueno = (err as { response?: { data?: BloqueoTrazoResponse } }).response?.data?.propietarioNombre;
      if (dueno) {
        bloqueosAjenosRef.current.set(trazo.id, dueno);
        forzarRender();
        setAviso(`🔒 ${dueno} está editando ese trazo. Espera a que lo suelte.`);
      } else {
        setAviso(extraerMensajeError(err, 'No se pudo seleccionar el trazo'));
      }
    }
  }

  /** Suelta el bloqueo del trazo seleccionado (si hay) para que otros puedan tomarlo. */
  async function liberarSeleccion() {
    const seleccion = seleccionRef.current;
    if (!seleccion || !comunidadId) return;
    seleccionRef.current = null;
    arrastreRef.current = null;
    // Optimista: el evento EDITADO de la ultima edicion puede llegar un instante despues
    const confirmado = trazosRef.current.get(seleccion.trazo.secuencia);
    if (confirmado) trazosRef.current.set(confirmado.secuencia, { ...confirmado, puntos: seleccion.puntos });
    forzarRender();
    solicitarRedibujado();
    await api.delete(`/api/comunidades/${comunidadId}/lienzo/trazos/${seleccion.trazo.id}/bloqueo`).catch(() => {});
  }

  function perderSeleccion(mensaje: string) {
    const seleccion = seleccionRef.current;
    seleccionRef.current = null;
    arrastreRef.current = null;
    if (seleccion) {
      // Se vuelve a la ultima version confirmada por el servidor
      const confirmado = trazosRef.current.get(seleccion.trazo.secuencia);
      if (!confirmado) trazosRef.current.set(seleccion.trazo.secuencia, seleccion.trazo);
    }
    setAviso(mensaje);
    forzarRender();
    solicitarRedibujado();
  }

  /** Envia la geometria nueva; durante el arrastre como mucho una peticion en vuelo a la vez. */
  function enviarEdicion(puntos: Punto[], forzar = false) {
    const seleccion = seleccionRef.current;
    if (!seleccion || !comunidadId) return;
    const ahora = performance.now();
    if (edicionEnVueloRef.current || (!forzar && ahora - ultimaEdicionRef.current < INTERVALO_EDICION_EN_VIVO_MS)) {
      edicionPendienteRef.current = puntos;
      return;
    }
    edicionEnVueloRef.current = true;
    edicionPendienteRef.current = null;
    ultimaEdicionRef.current = ahora;
    const t = seleccion.trazo;
    api
      .put(`/api/comunidades/${comunidadId}/lienzo/trazos/${t.id}`, {
        tipoPincel: t.tipoPincel,
        colorHex: t.colorHex,
        grosor: t.grosor,
        opacidad: t.opacidad,
        capa: t.capa,
        puntos,
      })
      .catch((err) => perderSeleccion(extraerMensajeError(err, 'Ya no tienes este trazo bloqueado')))
      .finally(() => {
        edicionEnVueloRef.current = false;
        const pendiente = edicionPendienteRef.current;
        if (pendiente && seleccionRef.current) enviarEdicion(pendiente, !arrastreRef.current);
      });
  }

  function iniciarArrastre(nuevo: Arrastre) {
    arrastreRef.current = nuevo;
    const { ancho, alto } = dimRef.current;

    function alMoverVentana(ev: PointerEvent) {
      const arrastre = arrastreRef.current;
      const seleccion = seleccionRef.current;
      if (!arrastre || !seleccion) return;
      const puntero = coordenadasDesdeCliente(ev.clientX, ev.clientY);
      seleccion.puntos =
        arrastre.tipo === 'escala'
          ? escalar(
              arrastre.puntosIniciales,
              arrastre.ancla,
              factorDeEscala(arrastre.ancla, arrastre.esquinaOriginal, puntero, ancho, alto),
              ancho,
              alto,
            )
          : mover(arrastre.puntosIniciales, puntero.x - arrastre.inicio.x, puntero.y - arrastre.inicio.y);
      forzarRender();
      solicitarRedibujado();
      enviarEdicion(seleccion.puntos);
    }

    function alSoltarVentana() {
      window.removeEventListener('pointermove', alMoverVentana);
      window.removeEventListener('pointerup', alSoltarVentana);
      arrastreRef.current = null;
      const seleccion = seleccionRef.current;
      if (seleccion) enviarEdicion(seleccion.puntos, true);
    }

    window.addEventListener('pointermove', alMoverVentana);
    window.addEventListener('pointerup', alSoltarVentana);
  }

  function alIniciarEscala(esquina: Esquina, e: React.PointerEvent<HTMLElement>) {
    e.preventDefault();
    const seleccion = seleccionRef.current;
    if (!seleccion) return;
    const caja = cajaDe(seleccion.puntos);
    iniciarArrastre({
      tipo: 'escala',
      ancla: anclaOpuesta(caja, esquina),
      esquinaOriginal: esquinaDe(caja, esquina),
      puntosIniciales: seleccion.puntos,
    });
  }

  function alIniciarMover(e: React.PointerEvent<HTMLElement>) {
    e.preventDefault();
    const seleccion = seleccionRef.current;
    if (!seleccion) return;
    iniciarArrastre({
      tipo: 'mover',
      inicio: coordenadasDesdeCliente(e.clientX, e.clientY),
      puntosIniciales: seleccion.puntos,
    });
  }

  async function salirDelModoEditar() {
    await liberarSeleccion();
    setModoEditar(false);
  }

  function alDobleClic(e: React.MouseEvent<HTMLCanvasElement>) {
    e.preventDefault();
    setModoEditar(true);
    void seleccionarEn(coordenadasDesdeCliente(e.clientX, e.clientY));
  }

  function alClicDerecho(e: React.MouseEvent<HTMLCanvasElement>) {
    e.preventDefault();
    setModoEditar(true);
    void seleccionarEn(coordenadasDesdeCliente(e.clientX, e.clientY));
  }

  function alPresionar(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!comunidadId) return;
    const punto = coordenadasRelativas(e);
    const { ancho, alto } = dimRef.current;
    const ctx = ctxRef.current;

    // En modo edición (o con Alt presionado) el clic selecciona un trazo en vez de dibujar
    if (modoEditar || e.altKey) {
      if (!modoEditar) setModoEditar(true);
      void seleccionarEn(punto);
      return;
    }

    const id = generarUUID();
    const estilo: EstiloPincel = {
      tipoPincel: herramienta.tipoPincel,
      colorHex: herramienta.colorHex,
      grosor: herramienta.grosor,
      opacidad: herramienta.opacidad,
    };
    propioTrazoRef.current = { id, estilo, puntos: [punto], pendientes: [punto] };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    // Dibujar el punto inicial localmente
    if (ctx) {
      dibujarPunto(ctx, estilo, punto, ancho, alto);
    }
    // Emitir inmediatamente para que los demás vean el inicio del trazo de inmediato
    enviarParcial(comunidadId, id, [punto]);
  }

  function alMover(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const punto = coordenadasRelativas(e);
    const { ancho, alto } = dimRef.current;

    const actual = propioTrazoRef.current;
    if (!actual || e.buttons !== 1) return;
    const anterior = actual.puntos[actual.puntos.length - 1];
    dibujarSegmento(ctx, actual.estilo, anterior, punto, ancho, alto);
    actual.puntos.push(punto);
    actual.pendientes.push(punto);

    const ahora = performance.now();
    if ((actual.pendientes.length >= 2 || ahora - ultimoEnvioRef.current > 25) && comunidadId) {
      enviarParcial(comunidadId, actual.id, actual.pendientes);
      actual.pendientes = [punto]; // Deja el punto actual como origen del siguiente lote
      ultimoEnvioRef.current = ahora;
    }
  }

  function alSoltar() {
    const actual = propioTrazoRef.current;
    if (actual && comunidadId) {
      if (actual.pendientes.length > 1) {
        enviarParcial(comunidadId, actual.id, actual.pendientes);
      }
      // Proteger en pendientes locales para que nunca se borre si ocurre un redibujado concurrente
      trazosLocalesPendientesRef.current.set(actual.id, {
        id: actual.id,
        estilo: actual.estilo,
        puntos: [...actual.puntos],
        capa: 0,
        creadoEn: Date.now(),
      });
      stompService.publicar(`/app/lienzo/${comunidadId}/final`, {
        trazoEnProgresoId: actual.id,
        tipoPincel: actual.estilo.tipoPincel,
        colorHex: actual.estilo.colorHex,
        grosor: actual.estilo.grosor,
        opacidad: actual.estilo.opacidad,
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

  // Heartbeat del bloqueo mientras haya un trazo seleccionado; Esc suelta la selección
  useEffect(() => {
    if (!modoEditar || !comunidadId) return;
    const intervalo = setInterval(() => {
      const seleccion = seleccionRef.current;
      if (!seleccion) return;
      api
        .put(`/api/comunidades/${comunidadId}/lienzo/trazos/${seleccion.trazo.id}/bloqueo`)
        .catch(() => perderSeleccion('El bloqueo del trazo venció; vuelve a seleccionarlo para seguir editando.'));
    }, HEARTBEAT_BLOQUEO_MS);
    function alTeclear(e: KeyboardEvent) {
      if (e.key === 'Escape') void liberarSeleccion();
    }
    window.addEventListener('keydown', alTeclear);
    return () => {
      clearInterval(intervalo);
      window.removeEventListener('keydown', alTeclear);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoEditar, comunidadId]);

  // Al salir de la página no dejar el trazo bloqueado hasta que venza el TTL
  useEffect(
    () => () => {
      const seleccion = seleccionRef.current;
      if (seleccion && comunidadId) {
        api.delete(`/api/comunidades/${comunidadId}/lienzo/trazos/${seleccion.trazo.id}/bloqueo`).catch(() => {});
      }
    },
    [comunidadId],
  );

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
              Lienzo responsivo de pantalla completa · Usa «Editar trazos» (o doble clic sobre un trazo) para agrandarlo, achicarlo o moverlo
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-pressed={modoEditar}
            onClick={() => (modoEditar ? void salirDelModoEditar() : setModoEditar(true))}
            className={
              modoEditar
                ? 'btn-primary text-xs px-3 py-1.5 font-semibold bg-violet hover:brightness-110'
                : 'btn-ghost text-xs px-2.5 py-1.5 border border-ink-800 text-paper-muted hover:text-paper'
            }
            title="Seleccionar un trazo para agrandarlo, achicarlo o moverlo"
          >
            ✏️ {modoEditar ? 'Editando trazos' : 'Editar trazos'}
          </button>
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

      {/* En modo edición los pinceles no aplican: su lugar lo toma la barra de edición, fuera del lienzo */}
      {modoEditar ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet/50 bg-ink-900 px-4 py-2.5">
          <p className="text-xs text-paper font-medium">
            ✏️{' '}
            {seleccionRef.current
              ? 'Arrastra las esquinas para agrandar o achicar el trazo, o la caja para moverlo. Nadie más puede tocarlo mientras lo tengas.'
              : 'Haz clic sobre un trazo para seleccionarlo.'}
          </p>
          <div className="flex gap-2">
            {seleccionRef.current && (
              <button type="button" className="btn-secondary text-xs px-2.5 py-1" onClick={() => void liberarSeleccion()}>
                Soltar trazo
              </button>
            )}
            <button type="button" className="btn-primary text-xs px-3 py-1 font-semibold" onClick={() => void salirDelModoEditar()}>
              Listo
            </button>
          </div>
        </div>
      ) : (
        <BrushToolbar
          herramienta={herramienta}
          onCambiar={setHerramienta}
          orientacion="horizontal"
          onPublicar={abrirPublicar}
        />
      )}

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
          style={{ cursor: modoEditar ? 'pointer' : 'crosshair' }}
          onPointerDown={alPresionar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerLeave={alSoltar}
          onDoubleClick={alDobleClic}
          onContextMenu={alClicDerecho}
        />

        {/* Capa de cursores e indicadores flotantes en tiempo real con nombre */}
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
          {Object.values(cursoresRemotos).map((cursor) => (
            <div
              key={cursor.autorId}
              className="absolute transition-all duration-75 ease-out flex flex-col items-start select-none"
              style={{
                left: `${cursor.x * 100}%`,
                top: `${cursor.y * 100}%`,
                transform: 'translate(-4px, -34px)',
              }}
            >
              {/* Badge flotante con nombre y herramienta del artista */}
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-white shadow-xl border backdrop-blur-md whitespace-nowrap animate-in fade-in zoom-in-95 duration-100"
                style={{
                  backgroundColor: `${cursor.colorHex}E6`,
                  borderColor: cursor.colorHex,
                  boxShadow: `0 4px 14px ${cursor.colorHex}66`,
                }}
              >
                <span className="text-xs">✏️</span>
                <span className="font-semibold tracking-wide">{cursor.autorNombre}</span>
                <span className="text-[10px] font-normal opacity-85">
                  · {cursor.tipoPincel}
                </span>
              </div>

              {/* Puntero que señala exactamente las coordenadas del trazo */}
              <div className="relative mt-1 ml-1">
                <div
                  className="w-3.5 h-3.5 rounded-full border-2 border-white shadow-lg animate-ping absolute -inset-0.5 opacity-75"
                  style={{ backgroundColor: cursor.colorHex }}
                />
                <div
                  className="w-3 h-3 rounded-full border-2 border-white shadow-md"
                  style={{ backgroundColor: cursor.colorHex }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Trazos que otros artistas tienen bloqueados: se ven, pero no se pueden tomar */}
        {[...bloqueosAjenosRef.current.entries()].map(([trazoId, nombre]) => {
          const trazo = [...trazosRef.current.values()].find((t) => t.id === trazoId);
          if (!trazo || trazo.puntos.length === 0) return null;
          return (
            <CajaSeleccion
              key={trazoId}
              caja={cajaDe(trazo.puntos)}
              editable={false}
              etiqueta={`🔒 ${nombre} está editando`}
              anchoLineaPx={anchoDeLineaPx(trazo, Math.min(dimRef.current.ancho, dimRef.current.alto))}
            />
          );
        })}

        {/* Caja del trazo que yo tengo bloqueado: esquinas para escalar, cuerpo para mover */}
        {seleccionRef.current && (
          <CajaSeleccion
            caja={cajaDe(seleccionRef.current.puntos)}
            editable
            etiqueta={`Trazo de ${seleccionRef.current.trazo.autorNombre}`}
            anchoLineaPx={anchoDeLineaPx(seleccionRef.current.trazo, Math.min(dimRef.current.ancho, dimRef.current.alto))}
            onIniciarEscala={alIniciarEscala}
            onIniciarMover={alIniciarMover}
          />
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
