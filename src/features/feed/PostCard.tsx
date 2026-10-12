import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { api, extraerMensajeError } from '../../lib/api';
import { useAuthStore } from '../../lib/authStore';
import type { LikeResponse, PublicacionDto } from '../../types';

interface PostCardProps {
  publicacion: PublicacionDto;
  onEliminada?: (id: string) => void;
}

export function PostCard({ publicacion, onEliminada }: PostCardProps) {
  const sesion = useAuthStore((s) => s.sesion);
  const [meGusta, setMeGusta] = useState(publicacion.meGusta);
  const [contador, setContador] = useState(publicacion.contadorLikes);
  const [animando, setAnimando] = useState(false);
  const [procesoAbierto, setProcesoAbierto] = useState(false);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null);

  const esAutor = sesion?.usuarioId === publicacion.autorId;

  async function eliminar() {
    setBorrando(true);
    setErrorBorrado(null);
    try {
      await api.delete(`/api/publicaciones/${publicacion.id}`);
      onEliminada?.(publicacion.id);
    } catch (err) {
      setErrorBorrado(extraerMensajeError(err, 'No se pudo eliminar la publicación'));
      setBorrando(false);
      setConfirmandoBorrado(false);
    }
  }

  async function alternarLike() {
    const anteriorMeGusta = meGusta;
    const anteriorContador = contador;
    setMeGusta(!meGusta);
    setContador((c) => c + (meGusta ? -1 : 1));
    setAnimando(true);
    setTimeout(() => setAnimando(false), 350);
    try {
      const { data } = await api.post<LikeResponse>(`/api/publicaciones/${publicacion.id}/like`);
      setMeGusta(data.meGusta);
      setContador(data.contadorLikes);
    } catch {
      setMeGusta(anteriorMeGusta);
      setContador(anteriorContador);
    }
  }

  return (
    <motion.article initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card overflow-hidden p-0">
      <div className="flex items-center justify-between px-5 pt-4">
        <Link to={`/perfil/${publicacion.autorNombre}`} className="flex items-center gap-2 group">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-ink-700 text-xs font-semibold uppercase">
            {publicacion.autorNombre.slice(0, 2)}
          </span>
          <span className="text-sm font-medium text-paper group-hover:text-coral">{publicacion.autorNombre}</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-paper-dim">
            {formatDistanceToNow(new Date(publicacion.creadoEn), { addSuffix: true, locale: es })}
          </span>
          {esAutor && (
            <button
              onClick={() => setConfirmandoBorrado(true)}
              title="Eliminar publicación"
              className="text-paper-dim transition-colors hover:text-coral"
            >
              🗑
            </button>
          )}
        </div>
      </div>

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

      <div className="mt-3">
        <img src={publicacion.obraFinalUrl} alt={publicacion.titulo} className="max-h-[560px] w-full object-cover" loading="lazy" />
      </div>

      {publicacion.imagenesProcesoUrls.length > 0 && (
        <div className="border-t border-ink-800 px-5 py-3">
          <button
            onClick={() => setProcesoAbierto((v) => !v)}
            className="text-xs font-medium text-violet hover:underline"
          >
            {procesoAbierto ? 'Ocultar el proceso ▲' : `Ver el proceso (${publicacion.imagenesProcesoUrls.length}) ▼`}
          </button>
          {procesoAbierto && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-3 flex gap-2 overflow-x-auto pb-1"
            >
              {publicacion.imagenesProcesoUrls.map((url, i) => (
                <img key={i} src={url} alt={`Paso ${i + 1}`} className="h-28 w-28 flex-shrink-0 rounded-lg object-cover" />
              ))}
            </motion.div>
          )}
        </div>
      )}

      <div className="px-5 py-4">
        <h3 className="font-display text-lg font-semibold">{publicacion.titulo}</h3>
        {publicacion.descripcion && <p className="mt-1 text-sm text-paper-muted">{publicacion.descripcion}</p>}
        {publicacion.etiquetas.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {publicacion.etiquetas.map((t) => (
              <span key={t} className="chip text-xs">
                #{t}
              </span>
            ))}
          </div>
        )}

        <button onClick={alternarLike} className="mt-4 flex items-center gap-2 text-sm">
          <motion.span
            animate={animando ? { scale: [1, 1.4, 1] } : {}}
            transition={{ duration: 0.35 }}
            className={meGusta ? 'text-coral' : 'text-paper-muted'}
          >
            {meGusta ? '♥' : '♡'}
          </motion.span>
          <span className={meGusta ? 'font-medium text-coral' : 'text-paper-muted'}>{contador}</span>
        </button>
      </div>
    </motion.article>
  );
}
