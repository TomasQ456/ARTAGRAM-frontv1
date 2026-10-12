import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { api, extraerMensajeError } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { FondoEstudio } from '../../components/layout/FondoEstudio';
import { PostCard } from './PostCard';
import { PublishWizard } from './PublishWizard';
import type { FeedResponse, PublicacionDto } from '../../types';

export function FeedPage() {
  const [publicaciones, setPublicaciones] = useState<PublicacionDto[]>([]);
  const [sugeridos, setSugeridos] = useState<string[]>([]);
  const [cursor, setCursor] = useState<{ fecha: string; id: string } | null>(null);
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mostrarPublicar, setMostrarPublicar] = useState(false);

  async function cargar(desdeInicio: boolean) {
    try {
      const { data } = await api.get<FeedResponse>('/api/feed', {
        params: desdeInicio || !cursor ? {} : { cursorFecha: cursor.fecha, cursorId: cursor.id },
      });
      setPublicaciones((prev) => (desdeInicio ? data.publicaciones : [...prev, ...data.publicaciones]));
      setSugeridos(data.artistasSugeridos);
      setHayMas(data.hayMas);
      setCursor(data.cursorFechaSiguiente && data.cursorIdSiguiente ? { fecha: data.cursorFechaSiguiente, id: data.cursorIdSiguiente } : null);
    } catch (err) {
      setError(extraerMensajeError(err));
    }
  }

  useEffect(() => {
    cargar(true).finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargarMas() {
    setCargandoMas(true);
    await cargar(false);
    setCargandoMas(false);
  }

  return (
    <FondoEstudio>
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Feed</h1>
          <p className="text-sm text-paper-muted">Obras y su proceso, de la gente que sigues y de la comunidad.</p>
        </div>
        {!mostrarPublicar && <Button onClick={() => setMostrarPublicar(true)}>Publicar</Button>}
      </div>

      {sugeridos.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-ink-700 bg-ink-900/40 px-4 py-3">
          <span className="text-xs text-paper-dim">Artistas para descubrir:</span>
          {sugeridos.map((n) => (
            <Link key={n} to={`/perfil/${n}`} className="chip text-xs hover:border-coral/40 hover:text-coral">
              {n}
            </Link>
          ))}
        </div>
      )}

      <AnimatePresence>
        {mostrarPublicar && (
          <PublishWizard
            onCerrar={() => setMostrarPublicar(false)}
            onPublicado={(p) => {
              setPublicaciones((prev) => [p, ...prev]);
              setMostrarPublicar(false);
            }}
          />
        )}
      </AnimatePresence>

      {error && <p className="mb-4 rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral-light">{error}</p>}

      {cargando ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-coral border-t-transparent" />
        </div>
      ) : publicaciones.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-12 text-center">
          <div className="text-4xl">🖌️</div>
          <h3 className="font-display text-lg font-semibold">Todavía no hay nada en tu feed</h3>
          <p className="max-w-sm text-sm text-paper-muted">Publica tu primera obra o sigue a otros artistas para ver lo que hacen.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {publicaciones.map((p) => (
            <PostCard
              key={p.id}
              publicacion={p}
              onEliminada={(id) => setPublicaciones((prev) => prev.filter((x) => x.id !== id))}
            />
          ))}
        </div>
      )}

      {hayMas && (
        <div className="mt-6 flex justify-center">
          <Button variant="secondary" onClick={cargarMas} cargando={cargandoMas}>
            Cargar más
          </Button>
        </div>
      )}
    </div>
    </FondoEstudio>
  );
}
