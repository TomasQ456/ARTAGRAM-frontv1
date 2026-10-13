import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, extraerMensajeError } from '../../lib/api';
import { stompService } from '../../lib/stompClient';
import { useAuthStore } from '../../lib/authStore';
import { FondoEstudio } from '../../components/layout/FondoEstudio';
import type { ConversacionResumenDto, MensajePersonalDto, PerfilResponse } from '../../types';

interface ContactoSeleccionado {
  id: string;
  nombre: string;
}

const STORAGE_KEY_CONTACTO = 'artagram_chat_contacto_activo';

export function PersonalChatPage() {
  const sesion = useAuthStore((s) => s.sesion);
  const [searchParams, setSearchParams] = useSearchParams();

  const [conversaciones, setConversaciones] = useState<ConversacionResumenDto[]>([]);
  const [cargandoConversaciones, setCargandoConversaciones] = useState(true);
  const [filtroConversaciones, setFiltroConversaciones] = useState('');

  const [contactoActivo, setContactoActivo] = useState<ContactoSeleccionado | null>(null);
  const [mensajes, setMensajes] = useState<MensajePersonalDto[]>([]);
  const [cargandoMensajes, setCargandoMensajes] = useState(false);

  const [nuevoArtista, setNuevoArtista] = useState('');
  const [buscandoArtista, setBuscandoArtista] = useState(false);

  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finRef = useRef<HTMLDivElement>(null);
  const inputMensajeRef = useRef<HTMLInputElement>(null);

  // Cargar lista de conversaciones activas
  const cargarConversaciones = useCallback(async () => {
    try {
      const { data } = await api.get<ConversacionResumenDto[]>('/api/mensajes/conversaciones');
      setConversaciones(data);
      return data;
    } catch {
      return [];
    } finally {
      setCargandoConversaciones(false);
    }
  }, []);

  // Cargar historial con el contacto seleccionado
  const cargarHistorial = useCallback(async (contacto: ContactoSeleccionado) => {
    setCargandoMensajes(true);
    setError(null);
    try {
      const { data } = await api.get<MensajePersonalDto[]>(`/api/mensajes/con/${contacto.id}`);
      setMensajes(data);
      localStorage.setItem(STORAGE_KEY_CONTACTO, JSON.stringify(contacto));
    } catch (err) {
      setError(extraerMensajeError(err, 'No se pudo cargar el historial de mensajes'));
    } finally {
      setCargandoMensajes(false);
      setTimeout(() => inputMensajeRef.current?.focus(), 100);
    }
  }, []);

  // Seleccionar un contacto
  const seleccionarContacto = useCallback((contacto: ContactoSeleccionado) => {
    setContactoActivo(contacto);
    setSearchParams({ con: contacto.id, nombre: contacto.nombre }, { replace: true });
    cargarHistorial(contacto);
  }, [cargarHistorial, setSearchParams]);

  // Inicialización: sincronizar contacto desde query param, localStorage o la lista
  useEffect(() => {
    if (!sesion) return;

    cargarConversaciones().then((lista) => {
      // 1. Intentar desde URL search params (?con=... & nombre=... o ?u=...)
      const paramId = searchParams.get('con');
      const paramNombre = searchParams.get('nombre');
      const paramUser = searchParams.get('u');

      if (paramId && paramNombre) {
        seleccionarContacto({ id: paramId, nombre: paramNombre });
        return;
      }

      if (paramUser) {
        abrirPorNombre(paramUser);
        return;
      }

      // 2. Intentar desde localStorage persistido para no perder el chat al cerrar
      try {
        const guardado = localStorage.getItem(STORAGE_KEY_CONTACTO);
        if (guardado) {
          const contactoGuardado = JSON.parse(guardado) as ContactoSeleccionado;
          if (contactoGuardado.id && contactoGuardado.nombre) {
            seleccionarContacto(contactoGuardado);
            return;
          }
        }
      } catch {
        // Ignorar error de parsing
      }

      // 3. Si hay conversaciones existentes, abrir la más reciente automáticamente
      if (lista.length > 0) {
        seleccionarContacto({ id: lista[0].contactoId, nombre: lista[0].contactoNombre });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion]);

  // Conexión y escucha en tiempo real vía STOMP
  useEffect(() => {
    if (!sesion) return;
    stompService.conectar(sesion.accessToken);

    const desuscribir = stompService.suscribir<MensajePersonalDto>('/user/queue/mensajes', (m) => {
      // Actualizar mensajes si pertenece al chat abierto
      setContactoActivo((actual) => {
        if (actual && (m.remitenteId === actual.id || m.destinatarioId === actual.id)) {
          setMensajes((prev) => {
            if (prev.some((x) => x.id === m.id)) {
              return prev.map((x) => (x.id === m.id ? m : x));
            }
            return [...prev, m].sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
          });
        }
        return actual;
      });

      // Actualizar lista de conversaciones lateral
      setConversaciones((prev) => {
        const esMio = m.remitenteId === sesion.usuarioId;
        const otroId = esMio ? m.destinatarioId : m.remitenteId;
        const otroNombre = esMio ? (contactoActivo?.nombre ?? 'Artista') : m.remitenteNombre;

        const existe = prev.some((c) => c.contactoId === otroId);
        const actualizada: ConversacionResumenDto = {
          contactoId: otroId,
          contactoNombre: otroNombre,
          ultimoMensaje: m.contenido,
          ultimoMensajeEn: m.creadoEn,
          entregado: m.entregado,
        };

        if (existe) {
          return [actualizada, ...prev.filter((c) => c.contactoId !== otroId)];
        }
        return [actualizada, ...prev];
      });
    });

    return desuscribir;
  }, [sesion, contactoActivo]);

  // Auto-scroll hacia abajo
  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes.length]);

  // Buscar y abrir chat por nombre de artista
  async function abrirPorNombre(nombre: string) {
    if (!nombre.trim()) return;
    setBuscandoArtista(true);
    setError(null);
    try {
      const { data } = await api.get<PerfilResponse>(`/api/perfiles/${nombre.trim()}`);
      const nuevo: ContactoSeleccionado = { id: data.usuarioId, nombre: data.nombreArtista };
      setNuevoArtista('');
      seleccionarContacto(nuevo);
    } catch (err) {
      setError(extraerMensajeError(err, `No encontramos al artista "${nombre}"`));
    } finally {
      setBuscandoArtista(false);
    }
  }

  function alBuscarSubmit(e: React.FormEvent) {
    e.preventDefault();
    abrirPorNombre(nuevoArtista);
  }

  // Enviar mensaje confiable con confirmación y actualización optimista
  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim() || !contactoActivo || !sesion || enviando) return;

    const contenido = texto.trim();
    setTexto('');
    setEnviando(true);
    setError(null);

    const tempId = `temp-${Date.now()}`;
    const optimista: MensajePersonalDto = {
      id: tempId,
      remitenteId: sesion.usuarioId,
      remitenteNombre: sesion.nombreArtista,
      destinatarioId: contactoActivo.id,
      contenido,
      entregado: false,
      creadoEn: new Date().toISOString(),
    };

    setMensajes((prev) => [...prev, optimista]);

    // Actualizar sidebar inmediatamente
    setConversaciones((prev) => {
      const actualizada: ConversacionResumenDto = {
        contactoId: contactoActivo.id,
        contactoNombre: contactoActivo.nombre,
        ultimoMensaje: contenido,
        ultimoMensajeEn: optimista.creadoEn,
        entregado: false,
      };
      return [actualizada, ...prev.filter((c) => c.contactoId !== contactoActivo.id)];
    });

    try {
      const { data } = await api.post<MensajePersonalDto>('/api/mensajes', {
        destinatarioId: contactoActivo.id,
        contenido,
      });

      setMensajes((prev) => prev.map((m) => (m.id === tempId ? data : m)));

      setConversaciones((prev) =>
        prev.map((c) =>
          c.contactoId === contactoActivo.id
            ? { ...c, ultimoMensaje: data.contenido, ultimoMensajeEn: data.creadoEn, entregado: data.entregado }
            : c,
        ),
      );
    } catch (err) {
      setError(extraerMensajeError(err, 'No se pudo entregar el mensaje'));
      // Fallback por STOMP si el REST fallara por red
      stompService.publicar('/app/mensajes/enviar', {
        destinatarioId: contactoActivo.id,
        contenido,
      });
    } finally {
      setEnviando(false);
      setTimeout(() => inputMensajeRef.current?.focus(), 50);
    }
  }

  const conversacionesFiltradas = conversaciones.filter((c) =>
    c.contactoNombre.toLowerCase().includes(filtroConversaciones.toLowerCase()),
  );

  function formatearHora(iso: string) {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  return (
    <FondoEstudio>
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-paper">Mensajes Directos</h1>
            <p className="text-xs text-paper-dim">Conversaciones privadas en tiempo real entre artistas</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-center justify-between rounded-xl bg-coral/15 border border-coral/30 px-4 py-2.5 text-sm text-coral-light animate-in fade-in">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-xs underline hover:text-white">
              Cerrar
            </button>
          </div>
        )}

        {/* Panel principal de 2 columnas estilo mensajería moderna */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 h-[75vh] min-h-[520px]">
          {/* Columna Izquierda: Conversaciones y Búsqueda */}
          <div
            className={`md:col-span-4 lg:col-span-4 card flex flex-col p-3 overflow-hidden ${
              contactoActivo ? 'hidden md:flex' : 'flex'
            }`}
          >
            {/* Formulario para iniciar nuevo chat */}
            <form onSubmit={alBuscarSubmit} className="mb-3 space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-paper-muted">
                Iniciar nuevo chat
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={nuevoArtista}
                  onChange={(e) => setNuevoArtista(e.target.value)}
                  placeholder="Nombre de artista..."
                  className="input flex-1 py-1.5 text-xs"
                />
                <button
                  type="submit"
                  disabled={buscandoArtista || !nuevoArtista.trim()}
                  className="btn-primary px-3 py-1.5 text-xs whitespace-nowrap"
                >
                  {buscandoArtista ? '...' : 'Abrir'}
                </button>
              </div>
            </form>

            {/* Filtro de conversaciones existentes */}
            {conversaciones.length > 5 && (
              <div className="mb-2">
                <input
                  type="text"
                  value={filtroConversaciones}
                  onChange={(e) => setFiltroConversaciones(e.target.value)}
                  placeholder="Filtrar contactos..."
                  className="input py-1 text-xs bg-ink-900/40"
                />
              </div>
            )}

            <div className="flex items-center justify-between py-1 px-1 border-b border-ink-700/60 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-paper-dim">
                Conversaciones ({conversaciones.length})
              </span>
            </div>

            {/* Lista de chats activos */}
            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {cargandoConversaciones ? (
                <div className="py-8 text-center text-xs text-paper-dim">Cargando conversaciones...</div>
              ) : conversacionesFiltradas.length === 0 ? (
                <div className="py-8 px-4 text-center text-xs text-paper-dim">
                  {conversaciones.length === 0
                    ? 'No tienes chats abiertos todavía. Ingresa el nombre de un artista arriba para comenzar.'
                    : 'No se encontraron conversaciones con ese filtro.'}
                </div>
              ) : (
                conversacionesFiltradas.map((conv) => {
                  const esSeleccionado = contactoActivo?.id === conv.contactoId;
                  return (
                    <button
                      key={conv.contactoId}
                      onClick={() => seleccionarContacto({ id: conv.contactoId, nombre: conv.contactoNombre })}
                      className={`w-full text-left p-2.5 rounded-xl transition-all flex items-center gap-3 border ${
                        esSeleccionado
                          ? 'bg-ink-700/90 border-coral/50 shadow-md'
                          : 'bg-ink-800/40 border-transparent hover:bg-ink-700/50 hover:border-ink-600/40'
                      }`}
                    >
                      {/* Avatar con inicial */}
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-coral to-amber flex items-center justify-center font-bold text-ink-950 text-sm shrink-0 shadow-inner">
                        {conv.contactoNombre.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-paper truncate">{conv.contactoNombre}</span>
                          <span className="text-[10px] text-paper-dim shrink-0 ml-1">
                            {formatearHora(conv.ultimoMensajeEn)}
                          </span>
                        </div>
                        <p className="text-xs text-paper-muted truncate mt-0.5">{conv.ultimoMensaje}</p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Columna Derecha: Hilo de mensajes y escritura */}
          <div
            className={`md:col-span-8 lg:col-span-8 card flex flex-col overflow-hidden ${
              contactoActivo ? 'flex' : 'hidden md:flex'
            }`}
          >
            {contactoActivo ? (
              <>
                {/* Cabecera del chat actual */}
                <div className="p-3.5 border-b border-ink-700/70 bg-ink-800/90 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setContactoActivo(null)}
                      className="md:hidden text-xs text-paper-dim hover:text-paper px-2 py-1 bg-ink-700 rounded-lg"
                    >
                      ← Atrás
                    </button>
                    <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-violet to-coral flex items-center justify-center font-bold text-white text-sm shadow">
                      {contactoActivo.nombre.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-paper flex items-center gap-2">
                        {contactoActivo.nombre}
                      </h2>
                      <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" /> En línea
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/perfil/${contactoActivo.nombre}`}
                      className="text-xs text-violet hover:text-violet-light font-medium px-2.5 py-1 rounded-lg bg-ink-700/50 hover:bg-ink-700 border border-ink-600/40 transition-colors"
                    >
                      Ver perfil
                    </Link>
                  </div>
                </div>

                {/* Área de mensajes con scroll */}
                <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-ink-950/20">
                  {cargandoMensajes ? (
                    <div className="py-12 text-center text-xs text-paper-dim">Cargando mensajes...</div>
                  ) : mensajes.length === 0 ? (
                    <div className="py-16 text-center">
                      <div className="w-12 h-12 rounded-full bg-ink-700/50 mx-auto flex items-center justify-center text-xl mb-3 text-paper-dim">
                        💬
                      </div>
                      <p className="text-sm font-medium text-paper">Sin mensajes aún</p>
                      <p className="text-xs text-paper-dim mt-1">
                        Escribe tu primer mensaje para conversar con {contactoActivo.nombre}.
                      </p>
                    </div>
                  ) : (
                    mensajes.map((m) => {
                      const esPropio = m.remitenteId === sesion?.usuarioId;
                      return (
                        <div key={m.id} className={`flex flex-col ${esPropio ? 'items-end' : 'items-start'}`}>
                          <div
                            className={`max-w-[78%] px-3.5 py-2 text-sm leading-relaxed ${
                              esPropio
                                ? 'bg-gradient-to-r from-coral to-coral-light text-white rounded-2xl rounded-tr-xs shadow-md'
                                : 'bg-ink-700/90 text-paper border border-ink-600/50 rounded-2xl rounded-tl-xs shadow-sm'
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words">{m.contenido}</p>
                          </div>
                          <div
                            className={`mt-1 flex items-center gap-1.5 text-[10px] text-paper-dim ${
                              esPropio ? 'pr-1' : 'pl-1'
                            }`}
                          >
                            <span>{formatearHora(m.creadoEn)}</span>
                            {esPropio && (
                              <span className="text-[11px]">{m.entregado ? '✓✓' : '✓'}</span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={finRef} />
                </div>

                {/* Barra de envío */}
                <form onSubmit={enviar} className="p-3 border-t border-ink-700/70 bg-ink-800/90 flex gap-2 items-center">
                  <input
                    ref={inputMensajeRef}
                    type="text"
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder={`Escribe un mensaje a ${contactoActivo.nombre}...`}
                    maxLength={2000}
                    className="input flex-1 py-2 text-sm bg-ink-900/60"
                  />
                  <button
                    type="submit"
                    disabled={enviando || !texto.trim()}
                    className="btn-primary px-4 py-2 text-sm shrink-0"
                  >
                    {enviando ? 'Enviando...' : 'Enviar'}
                  </button>
                </form>
              </>
            ) : (
              /* Estado cuando no hay contacto seleccionado */
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-ink-700/50 border border-ink-600/40 flex items-center justify-center text-3xl mb-4 text-paper-dim shadow-inner">
                  ✉️
                </div>
                <h3 className="text-lg font-bold text-paper">Tus conversaciones directas</h3>
                <p className="text-xs text-paper-dim max-w-sm mt-1.5 leading-relaxed">
                  Selecciona una conversación existente del panel izquierdo o escribe el nombre de un artista para
                  iniciar un nuevo chat privado.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </FondoEstudio>
  );
}
