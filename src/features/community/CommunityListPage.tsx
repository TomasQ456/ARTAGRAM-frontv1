import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api, extraerMensajeError } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { FondoEstudio } from '../../components/layout/FondoEstudio';
import { TextField } from '../../components/ui/TextField';
import type { ComunidadResponse } from '../../types';

export function CommunityListPage() {
  const [comunidades, setComunidades] = useState<ComunidadResponse[]>([]);
  const [mostrarCrear, setMostrarCrear] = useState(false);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [publica, setPublica] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [codigoUnirse, setCodigoUnirse] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    cargarMisComunidades();
  }, []);

  function cargarMisComunidades() {
    setCargando(true);
    return api
      .get<ComunidadResponse[]>('/api/comunidades/mias')
      .then((r) => setComunidades(r.data))
      .catch((err) => setError(extraerMensajeError(err)))
      .finally(() => setCargando(false));
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await api.post<ComunidadResponse>('/api/comunidades', { nombre, descripcion, publica });
      await cargarMisComunidades();
      setMostrarCrear(false);
      setNombre('');
      setDescripcion('');
    } catch (err) {
      setError(extraerMensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  async function unirsePorId(id: string) {
    try {
      await api.post<ComunidadResponse>(`/api/comunidades/${id}/miembros`);
      await cargarMisComunidades();
    } catch (err) {
      setError(extraerMensajeError(err));
    }
  }

  return (
    <FondoEstudio>
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Comunidades</h1>
          <p className="text-sm text-paper-muted">Crea o entra a una para pintar sobre un lienzo compartido.</p>
        </div>
        <Button onClick={() => setMostrarCrear((v) => !v)}>{mostrarCrear ? 'Cancelar' : 'Crear comunidad'}</Button>
      </div>

      {error && <p className="mb-4 rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral-light">{error}</p>}

      {mostrarCrear && (
        <motion.form
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          onSubmit={crear}
          className="card mb-8 flex flex-col gap-4 p-6"
        >
          <TextField label="Nombre" required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Acuarela Urbana" />
          <TextField
            label="Descripción"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="¿Qué dibujan aquí?"
          />
          <label className="flex items-center gap-2 text-sm text-paper-muted">
            <input type="checkbox" checked={publica} onChange={(e) => setPublica(e.target.checked)} className="accent-coral" />
            Pública (cualquiera se puede unir)
          </label>
          <Button type="submit" cargando={enviando} className="self-start">
            Crear
          </Button>
        </motion.form>
      )}

      <div className="mb-8 card flex flex-wrap items-end gap-3 p-4">
        <TextField
          label="Unirme por ID de comunidad"
          value={codigoUnirse}
          onChange={(e) => setCodigoUnirse(e.target.value)}
          placeholder="pega el id que te compartieron"
          className="min-w-[280px] flex-1"
        />
        <Button variant="secondary" onClick={() => codigoUnirse && unirsePorId(codigoUnirse)}>
          Unirme
        </Button>
      </div>

      {cargando ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-coral border-t-transparent" />
        </div>
      ) : comunidades.length === 0 ? (
        <EstadoVacio />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {comunidades.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.05 }}
            >
              <Link
                to={`/comunidades/${c.id}`}
                className="card group block h-full p-5 transition-transform hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="chip">{c.miRol ?? 'miembro'}</span>
                  <span className="text-xs text-paper-dim">{c.totalMiembros} miembros</span>
                </div>
                <h3 className="font-display text-lg font-semibold group-hover:text-coral">{c.nombre}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-paper-muted">{c.descripcion || 'Sin descripción'}</p>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
    </FondoEstudio>
  );
}

function EstadoVacio() {
  return (
    <div className="card flex flex-col items-center gap-3 p-12 text-center">
      <div className="text-4xl">🎨</div>
      <h3 className="font-display text-lg font-semibold">Todavía no tienes comunidades</h3>
      <p className="max-w-sm text-sm text-paper-muted">
        Crea una para juntar gente que dibuja lo que a ti te gusta, o pega el ID de una que te hayan compartido.
      </p>
    </div>
  );
}
