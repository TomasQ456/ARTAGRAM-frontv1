import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { BotonSeguir } from './BotonSeguir';
import type { ArtistaResumen } from '../../types';

interface Props {
  /** Con la busqueda vacia, mostrar artistas sugeridos (p. ej. cuando el feed esta vacio). */
  mostrarSugerencias: boolean;
  onSeguimientoCambiado: () => void;
}

export function BuscarArtistas({ mostrarSugerencias, onSeguimientoCambiado }: Props) {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<ArtistaResumen[]>([]);
  const [buscando, setBuscando] = useState(false);

  const consulta = texto.trim();
  const visible = consulta.length > 0 || mostrarSugerencias;

  useEffect(() => {
    if (!visible) return;
    const controlador = new AbortController();
    const temporizador = setTimeout(() => {
      setBuscando(true);
      api
        .get<ArtistaResumen[]>('/api/artistas', { params: { q: consulta }, signal: controlador.signal })
        .then((r) => setResultados(r.data))
        .catch(() => {})
        .finally(() => setBuscando(false));
    }, 300);
    return () => {
      clearTimeout(temporizador);
      controlador.abort();
    };
  }, [consulta, visible]);

  function alCambiarSeguimiento(usuarioId: string, loSigo: boolean) {
    setResultados((prev) =>
      prev.map((a) =>
        a.usuarioId === usuarioId ? { ...a, loSigo, seguidores: Math.max(0, a.seguidores + (loSigo ? 1 : -1)) } : a,
      ),
    );
    onSeguimientoCambiado();
  }

  return (
    <div className="mb-6 rounded-xl border border-ink-700 bg-ink-900/40 p-4">
      <label className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 focus-within:border-coral/50">
        <span aria-hidden>🔍</span>
        <input
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar artistas por nombre…"
          className="w-full bg-transparent text-sm text-paper placeholder:text-paper-dim focus:outline-none"
          aria-label="Buscar artistas por nombre"
        />
        {buscando && <span className="h-4 w-4 animate-spin rounded-full border-2 border-coral border-t-transparent" />}
      </label>

      {visible && (
        <div className="mt-3">
          {!consulta && <p className="mb-2 text-xs text-paper-dim">Artistas para descubrir — síguelos para ver sus obras en tu feed:</p>}
          {resultados.length === 0 && !buscando ? (
            <p className="text-sm text-paper-muted">{consulta ? `No hay artistas que coincidan con "${consulta}".` : 'Aún no hay otros artistas.'}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-ink-800">
              {resultados.map((a) => (
                <li key={a.usuarioId} className="flex items-center justify-between gap-3 py-2">
                  <Link to={`/perfil/${a.nombreArtista}`} className="flex min-w-0 items-center gap-3 hover:text-coral">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-700 text-xs font-semibold uppercase">
                      {a.nombreArtista.slice(0, 2)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{a.nombreArtista}</span>
                      <span className="block text-[11px] text-paper-dim">
                        {a.seguidores} {a.seguidores === 1 ? 'seguidor' : 'seguidores'}
                      </span>
                    </span>
                  </Link>
                  <BotonSeguir
                    usuarioId={a.usuarioId}
                    loSigo={a.loSigo}
                    onCambio={(loSigo) => alCambiarSeguimiento(a.usuarioId, loSigo)}
                    className="text-xs px-3 py-1"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
