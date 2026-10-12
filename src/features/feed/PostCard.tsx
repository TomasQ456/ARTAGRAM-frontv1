import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { api, extraerMensajeError } from '../../lib/api';
import { useAuthStore } from '../../lib/authStore';
import { stompService } from '../../lib/stompClient';
import type {
  AnalisisObraDto,
  AnalisisTecnicoResultado,
  ComentarioDto,
  ComentarioEvento,
  LikeResponse,
  PublicacionDto,
} from '../../types';

interface PostCardProps {
  publicacion: PublicacionDto;
  onEliminada?: (id: string) => void;
  onActualizada?: (p: PublicacionDto) => void;
}

export function PostCard({ publicacion, onEliminada, onActualizada }: PostCardProps) {
  const sesion = useAuthStore((s) => s.sesion);
  const [pub, setPub] = useState(publicacion);
  const [meGusta, setMeGusta] = useState(pub.meGusta);
  const [contadorLikes, setContadorLikes] = useState(pub.contadorLikes);
  const [animandoLike, setAnimandoLike] = useState(false);
  const [procesoAbierto, setProcesoAbierto] = useState(false);

  // Estados de eliminación
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null);

  // Estados de Edición
  const [editando, setEditando] = useState(false);
  const [editTitulo, setEditTitulo] = useState(pub.titulo);
  const [editDescripcion, setEditDescripcion] = useState(pub.descripcion);
  const [editEtiquetas, setEditEtiquetas] = useState(pub.etiquetas.join(', '));
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);

  // Estados de Comentarios en Vivo
  const [comentariosAbiertos, setComentariosAbiertos] = useState(false);
  const [comentarios, setComentarios] = useState<ComentarioDto[]>([]);
  const [cargandoComentarios, setCargandoComentarios] = useState(false);
  const [nuevoComentario, setNuevoComentario] = useState('');
  const [enviandoComentario, setEnviandoComentario] = useState(false);
  const [contadorComentarios, setContadorComentarios] = useState(pub.contadorComentarios ?? 0);
  const [errorComentario, setErrorComentario] = useState<string | null>(null);

  // Estados de IA
  const [iaAbierta, setIaAbierta] = useState(false);
  const [analisisIa, setAnalisisIa] = useState<AnalisisTecnicoResultado | null>(null);
  const [cargandoIa, setCargandoIa] = useState(false);
  const [errorIa, setErrorIa] = useState<string | null>(null);
  const [modeloIa, setModeloIa] = useState<string | null>(null);

  const esAutor = sesion?.usuarioId === pub.autorId;

  // Suscripción STOMP en tiempo real a los comentarios de esta publicación
  useEffect(() => {
    if (!comentariosAbiertos) return;

    const destino = `/topic/publicaciones/${pub.id}/comentarios`;
    const desuscribir = stompService.suscribir<ComentarioEvento>(destino, (evento) => {
      if (evento.tipo === 'COMENTARIO_CREADO' && evento.comentario) {
        setComentarios((prev) => {
          if (prev.some((c) => c.id === evento.comentario.id)) return prev;
          return [...prev, evento.comentario];
        });
        setContadorComentarios(evento.contadorComentarios);
      }
    });

    return () => {
      desuscribir?.();
    };
  }, [comentariosAbiertos, pub.id]);

  // Cargar comentarios iniciales al desplegar
  async function toggleComentarios() {
    const nuevoEstado = !comentariosAbiertos;
    setComentariosAbiertos(nuevoEstado);
    if (nuevoEstado && comentarios.length === 0) {
      setCargandoComentarios(true);
      try {
        const { data } = await api.get<ComentarioDto[]>(`/api/publicaciones/${pub.id}/comentarios`);
        setComentarios(data);
      } catch (err) {
        setErrorComentario(extraerMensajeError(err, 'No se pudieron cargar los comentarios'));
      } finally {
        setCargandoComentarios(false);
      }
    }
  }

  // Enviar comentario plano
  async function enviarComentario(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevoComentario.trim() || enviandoComentario) return;

    setEnviandoComentario(true);
    setErrorComentario(null);
    try {
      const { data } = await api.post<ComentarioDto>(`/api/publicaciones/${pub.id}/comentarios`, {
        contenido: nuevoComentario.trim(),
      });
      setComentarios((prev) => (prev.some((c) => c.id === data.id) ? prev : [...prev, data]));
      setContadorComentarios((c) => c + 1);
      setNuevoComentario('');
    } catch (err) {
      setErrorComentario(extraerMensajeError(err, 'No se pudo enviar el comentario'));
    } finally {
      setEnviandoComentario(false);
    }
  }

  // Eliminar comentario
  async function borrarComentario(comentarioId: string) {
    try {
      await api.delete(`/api/comentarios/${comentarioId}`);
      setComentarios((prev) => prev.filter((c) => c.id !== comentarioId));
      setContadorComentarios((c) => Math.max(0, c - 1));
    } catch (err) {
      setErrorComentario(extraerMensajeError(err, 'No se pudo eliminar el comentario'));
    }
  }

  // Guardar edición de la publicación con optimistic locking
  async function guardarEdicion(e: React.FormEvent) {
    e.preventDefault();
    if (!editTitulo.trim()) return;

    setGuardandoEdicion(true);
    setErrorEdicion(null);
    try {
      const tagsArray = editEtiquetas
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const { data } = await api.patch<PublicacionDto>(`/api/publicaciones/${pub.id}`, {
        titulo: editTitulo.trim(),
        descripcion: editDescripcion.trim(),
        etiquetas: tagsArray,
        version: pub.version ?? 0,
      });

      setPub(data);
      onActualizada?.(data);
      setEditando(false);
    } catch (err) {
      setErrorEdicion(extraerMensajeError(err, 'No se pudo guardar la edición'));
    } finally {
      setGuardandoEdicion(false);
    }
  }

  // Alternar like
  async function alternarLike() {
    const anteriorMeGusta = meGusta;
    const anteriorContador = contadorLikes;
    setMeGusta(!meGusta);
    setContadorLikes((c) => c + (meGusta ? -1 : 1));
    setAnimandoLike(true);
    setTimeout(() => setAnimandoLike(false), 350);
    try {
      const { data } = await api.post<LikeResponse>(`/api/publicaciones/${pub.id}/like`);
      setMeGusta(data.meGusta);
      setContadorLikes(data.contadorLikes);
    } catch {
      setMeGusta(anteriorMeGusta);
      setContadorLikes(anteriorContador);
    }
  }

  // Eliminar publicación
  async function eliminar() {
    setBorrando(true);
    setErrorBorrado(null);
    try {
      await api.delete(`/api/publicaciones/${pub.id}`);
      onEliminada?.(pub.id);
    } catch (err) {
      setErrorBorrado(extraerMensajeError(err, 'No se pudo eliminar la publicación'));
      setBorrando(false);
      setConfirmandoBorrado(false);
    }
  }

  // Consultar o generar feedback técnico de IA
  async function toggleIa() {
    const nuevoEstado = !iaAbierta;
    setIaAbierta(nuevoEstado);
    if (nuevoEstado && !analisisIa) {
      setCargandoIa(true);
      setErrorIa(null);
      try {
        // Intentar obtener el último análisis guardado primero (historial)
        const { data } = await api.get<AnalisisObraDto>(`/api/publicaciones/${pub.id}/analisis/ultimo?tipo=TECNICO`);
        const parsed = JSON.parse(data.resultadoJson) as AnalisisTecnicoResultado;
        setAnalisisIa(parsed);
        setModeloIa(data.modelo);
      } catch {
        // Si no existe, dejamos listo para que el usuario solicite uno
        setAnalisisIa(null);
      } finally {
        setCargandoIa(false);
      }
    }
  }

  async function pedirAnalisisIa() {
    setCargandoIa(true);
    setErrorIa(null);
    try {
      const { data } = await api.post<AnalisisObraDto>(`/api/publicaciones/${pub.id}/analisis?tipo=TECNICO`);
      const parsed = JSON.parse(data.resultadoJson) as AnalisisTecnicoResultado;
      setAnalisisIa(parsed);
      setModeloIa(data.modelo);
    } catch (err) {
      setErrorIa(extraerMensajeError(err, 'No se pudo generar el análisis de IA'));
    } finally {
      setCargandoIa(false);
    }
  }

  return (
    <motion.article initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card overflow-hidden p-0">
      {/* Cabecera del autor */}
      <div className="flex items-center justify-between px-5 pt-4">
        <Link to={`/perfil/${pub.autorNombre}`} className="flex items-center gap-2 group">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-ink-700 text-xs font-semibold uppercase">
            {pub.autorNombre.slice(0, 2)}
          </span>
          <span className="text-sm font-medium text-paper group-hover:text-coral">{pub.autorNombre}</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-paper-dim">
            {formatDistanceToNow(new Date(pub.creadoEn), { addSuffix: true, locale: es })}
          </span>
          {esAutor && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditando(true)}
                title="Editar publicación"
                className="text-paper-dim transition-colors hover:text-amber-400 text-sm"
              >
                ✏️
              </button>
              <button
                onClick={() => setConfirmandoBorrado(true)}
                title="Eliminar publicación"
                className="text-paper-dim transition-colors hover:text-coral text-sm"
              >
                🗑
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Alerta de confirmación de borrado */}
      <AnimatePresence>
        {confirmandoBorrado && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-b border-coral/30 bg-coral/10 px-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <p className="text-sm text-coral-light">¿Eliminar esta publicación? No se puede deshacer.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmandoBorrado(false)}
                  className="rounded-lg px-3 py-1 text-xs font-medium text-paper-muted hover:bg-ink-800"
                  disabled={borrando}
                >
                  Cancelar
                </button>
                <button
                  onClick={eliminar}
                  className="rounded-lg bg-coral px-3 py-1 text-xs font-medium text-ink-950 hover:bg-coral-dark disabled:opacity-60"
                  disabled={borrando}
                >
                  {borrando ? 'Eliminando…' : 'Sí, eliminar'}
                </button>
              </div>
            </div>
            {errorBorrado && <p className="pb-2 text-xs text-coral-light">{errorBorrado}</p>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal/Formulario de Edición */}
      <AnimatePresence>
        {editando && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-b border-violet/30 bg-ink-900/90 p-5"
          >
            <form onSubmit={guardarEdicion} className="flex flex-col gap-3">
              <h4 className="text-sm font-semibold text-paper">Editar publicación</h4>
              <div>
                <label className="text-xs text-paper-dim">Título</label>
                <input
                  type="text"
                  value={editTitulo}
                  onChange={(e) => setEditTitulo(e.target.value)}
                  className="w-full rounded-lg bg-ink-800 border border-ink-700 px-3 py-1.5 text-sm text-paper focus:outline-none focus:border-violet"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-paper-dim">Descripción</label>
                <textarea
                  value={editDescripcion}
                  onChange={(e) => setEditDescripcion(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg bg-ink-800 border border-ink-700 px-3 py-1.5 text-sm text-paper focus:outline-none focus:border-violet"
                />
              </div>
              <div>
                <label className="text-xs text-paper-dim">Etiquetas (separadas por coma)</label>
                <input
                  type="text"
                  value={editEtiquetas}
                  onChange={(e) => setEditEtiquetas(e.target.value)}
                  className="w-full rounded-lg bg-ink-800 border border-ink-700 px-3 py-1.5 text-sm text-paper focus:outline-none focus:border-violet"
                  placeholder="acuarela, paisaje, estudio"
                />
              </div>
              {errorEdicion && <p className="text-xs text-coral">{errorEdicion}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditando(false)}
                  className="rounded-lg px-3 py-1 text-xs text-paper-muted hover:bg-ink-800"
                  disabled={guardandoEdicion}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-violet px-3 py-1 text-xs font-medium text-white hover:bg-violet-600 disabled:opacity-60"
                  disabled={guardandoEdicion}
                >
                  {guardandoEdicion ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Imagen de la obra */}
      <div className="mt-3">
        <img src={pub.obraFinalUrl} alt={pub.titulo} className="max-h-[560px] w-full object-cover" loading="lazy" />
      </div>

      {/* Despliegue de imágenes del proceso */}
      {pub.imagenesProcesoUrls.length > 0 && (
        <div className="border-t border-ink-800 px-5 py-3">
          <button
            onClick={() => setProcesoAbierto((v) => !v)}
            className="text-xs font-medium text-violet hover:underline"
          >
            {procesoAbierto ? 'Ocultar el proceso ▲' : `Ver el proceso (${pub.imagenesProcesoUrls.length}) ▼`}
          </button>
          {procesoAbierto && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-3 flex gap-2 overflow-x-auto pb-1"
            >
              {pub.imagenesProcesoUrls.map((url, i) => (
                <img key={i} src={url} alt={`Paso ${i + 1}`} className="h-28 w-28 flex-shrink-0 rounded-lg object-cover" />
              ))}
            </motion.div>
          )}
        </div>
      )}

      {/* Metadatos y acciones */}
      <div className="px-5 py-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-lg font-semibold">{pub.titulo}</h3>
            {pub.descripcion && <p className="mt-1 text-sm text-paper-muted">{pub.descripcion}</p>}
          </div>
          {pub.editadoEn && (
            <span className="text-[10px] text-paper-dim italic">editado</span>
          )}
        </div>

        {pub.etiquetas.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {pub.etiquetas.map((t) => (
              <span key={t} className="chip text-xs">
                #{t}
              </span>
            ))}
          </div>
        )}

        {/* Barra de Interacción: Likes, Comentarios, Análisis IA */}
        <div className="mt-4 flex items-center justify-between border-t border-ink-800 pt-3">
          <div className="flex items-center gap-5">
            {/* Botón Me Gusta */}
            <button onClick={alternarLike} className="flex items-center gap-1.5 text-sm transition-transform active:scale-95">
              <motion.span
                animate={animandoLike ? { scale: [1, 1.4, 1] } : {}}
                transition={{ duration: 0.35 }}
                className={meGusta ? 'text-coral' : 'text-paper-muted'}
              >
                {meGusta ? '♥' : '♡'}
              </motion.span>
              <span className={meGusta ? 'font-medium text-coral' : 'text-paper-muted'}>{contadorLikes}</span>
            </button>

            {/* Botón Comentarios */}
            <button
              onClick={toggleComentarios}
              className={`flex items-center gap-1.5 text-sm transition-colors ${
                comentariosAbiertos ? 'text-teal-400 font-medium' : 'text-paper-muted hover:text-paper'
              }`}
            >
              <span>💬</span>
              <span>{contadorComentarios}</span>
            </button>
          </div>

          {/* Botón Análisis IA */}
          <button
            onClick={toggleIa}
            className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-all ${
              iaAbierta
                ? 'border-violet text-violet bg-violet/10 font-medium'
                : 'border-ink-700 text-paper-dim hover:text-paper hover:border-paper-dim'
            }`}
          >
            <span>✨</span>
            <span>Feedback IA</span>
          </button>
        </div>

        {/* Panel de Comentarios en Vivo (Linear / Flat) */}
        <AnimatePresence>
          {comentariosAbiertos && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 overflow-hidden border-t border-ink-800 pt-3"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-paper-dim uppercase tracking-wider">
                  Comentarios en tiempo real ({contadorComentarios})
                </span>
              </div>

              {cargandoComentarios ? (
                <p className="py-2 text-xs text-paper-dim">Cargando comentarios…</p>
              ) : comentarios.length === 0 ? (
                <p className="py-2 text-xs text-paper-dim italic">Aún no hay comentarios. ¡Sé el primero en opinar!</p>
              ) : (
                <div className="max-h-60 space-y-2.5 overflow-y-auto pr-1">
                  {comentarios.map((c) => {
                    const esAutorComentario = sesion?.usuarioId === c.autorId;
                    const puedeEliminar = esAutorComentario || esAutor;
                    return (
                      <div key={c.id} className="flex items-start justify-between gap-2 rounded-lg bg-ink-900/60 p-2.5 text-xs">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-paper">{c.autorNombre}</span>
                            <span className="text-[10px] text-paper-dim">
                              {formatDistanceToNow(new Date(c.creadoEn), { addSuffix: true, locale: es })}
                            </span>
                          </div>
                          <p className="mt-1 text-paper-muted break-words">{c.contenido}</p>
                        </div>
                        {puedeEliminar && (
                          <button
                            onClick={() => borrarComentario(c.id)}
                            title="Eliminar comentario"
                            className="text-paper-dim hover:text-coral transition-colors"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Formulario para comentar */}
              <form onSubmit={enviarComentario} className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={nuevoComentario}
                  onChange={(e) => setNuevoComentario(e.target.value)}
                  placeholder="Escribe un comentario respetuoso…"
                  maxLength={500}
                  className="flex-1 rounded-lg bg-ink-900 border border-ink-700 px-3 py-1.5 text-xs text-paper placeholder-paper-dim focus:outline-none focus:border-teal-400"
                />
                <button
                  type="submit"
                  disabled={enviandoComentario || !nuevoComentario.trim()}
                  className="rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-semibold text-ink-950 hover:bg-teal-400 disabled:opacity-50"
                >
                  {enviandoComentario ? '…' : 'Enviar'}
                </button>
              </form>
              {errorComentario && <p className="mt-1 text-xs text-coral">{errorComentario}</p>}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Panel de Análisis Técnico con IA */}
        <AnimatePresence>
          {iaAbierta && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 overflow-hidden rounded-xl border border-violet/30 bg-ink-900/90 p-4 text-xs"
            >
              <div className="flex items-center justify-between pb-2 border-b border-ink-800">
                <div className="flex items-center gap-1.5 text-violet font-semibold">
                  <span>🎨</span>
                  <span>Análisis Técnico de la Obra</span>
                </div>
                {modeloIa && <span className="text-[10px] text-paper-dim">Modelo: {modeloIa}</span>}
              </div>

              {cargandoIa ? (
                <div className="py-6 text-center text-paper-dim">
                  <span className="inline-block animate-spin text-lg mr-2">⚙️</span>
                  Analizando composición, luces y técnica con visión artificial…
                </div>
              ) : analisisIa ? (
                <div className="mt-3 space-y-3">
                  <div className="flex items-center justify-between bg-ink-800/60 p-2.5 rounded-lg">
                    <span className="font-medium text-paper">Puntaje Pedagógico Estimado:</span>
                    <span className="text-base font-bold text-violet">{analisisIa.scoreEstimado}/100</span>
                  </div>

                  {analisisIa.puntosFuertes?.length > 0 && (
                    <div>
                      <p className="font-semibold text-emerald-400 mb-1">✓ Puntos Fuertes:</p>
                      <ul className="list-disc list-inside space-y-0.5 text-paper-muted">
                        {analisisIa.puntosFuertes.map((pf, idx) => (
                          <li key={idx}>{pf}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {analisisIa.areasMejora?.length > 0 && (
                    <div>
                      <p className="font-semibold text-amber-400 mb-1">⚠ Áreas a Pulir:</p>
                      <ul className="list-disc list-inside space-y-0.5 text-paper-muted">
                        {analisisIa.areasMejora.map((am, idx) => (
                          <li key={idx}>{am}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {analisisIa.consejos?.length > 0 && (
                    <div>
                      <p className="font-semibold text-teal-400 mb-1">💡 Consejos Técnicos:</p>
                      <ul className="list-disc list-inside space-y-0.5 text-paper-muted">
                        {analisisIa.consejos.map((c, idx) => (
                          <li key={idx}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={pedirAnalisisIa}
                      disabled={cargandoIa}
                      className="text-[11px] text-violet hover:underline"
                    >
                      🔄 Re-analizar obra con IA
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-4 text-center space-y-2">
                  <p className="text-paper-muted">Esta obra aún no ha sido analizada por la IA.</p>
                  <button
                    onClick={pedirAnalisisIa}
                    className="rounded-lg bg-violet px-3 py-1.5 font-medium text-white hover:bg-violet-600 shadow-sm"
                  >
                    ⚡ Generar análisis técnico ahora
                  </button>
                </div>
              )}

              {errorIa && <p className="mt-2 text-xs text-coral">{errorIa}</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.article>
  );
}
