import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api, extraerMensajeError } from '../../lib/api';
import { useAuthStore } from '../../lib/authStore';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import type { PerfilResponse } from '../../types';

interface EnlaceForm {
  etiqueta: string;
  url: string;
}
interface ObraForm {
  titulo: string;
  rutaImagen: string;
  previewUrl: string;
}

export function ProfilePage() {
  const { nombreArtista } = useParams<{ nombreArtista: string }>();
  const sesion = useAuthStore((s) => s.sesion);
  const [perfil, setPerfil] = useState<PerfilResponse | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);

  const [biografia, setBiografia] = useState('');
  const [enlaces, setEnlaces] = useState<EnlaceForm[]>([]);
  const [obras, setObras] = useState<ObraForm[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);

  useEffect(() => {
    if (!nombreArtista) return;
    setCargando(true);
    api
      .get<PerfilResponse>(`/api/perfiles/${nombreArtista}`)
      .then((r) => {
        setPerfil(r.data);
        setBiografia(r.data.biografia ?? '');
        setEnlaces(r.data.enlaces.map((e) => ({ etiqueta: e.etiqueta, url: e.url })));
        setObras(r.data.obrasDestacadas.map((o) => ({ titulo: o.titulo, rutaImagen: '', previewUrl: o.imagenUrl })));
      })
      .catch((err) => setError(extraerMensajeError(err, 'No encontramos a ese artista')))
      .finally(() => setCargando(false));
  }, [nombreArtista]);

  async function subirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setSubiendoFoto(true);
    try {
      const form = new FormData();
      form.append('archivo', archivo);
      const { data } = await api.post<{ fotoUrl: string }>('/api/perfil/me/foto', form);
      setPerfil((p) => (p ? { ...p, fotoUrl: data.fotoUrl } : p));
    } catch (err) {
      setError(extraerMensajeError(err));
    } finally {
      setSubiendoFoto(false);
    }
  }

  async function agregarObra(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo || obras.length >= 3) return;
    try {
      const form = new FormData();
      form.append('archivo', archivo);
      const { data } = await api.post<{ rutaImagen: string }>('/api/perfil/me/obras/imagen', form);
      setObras((prev) => [...prev, { titulo: '', rutaImagen: data.rutaImagen, previewUrl: URL.createObjectURL(archivo) }]);
    } catch (err) {
      setError(extraerMensajeError(err));
    }
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const { data } = await api.put<PerfilResponse>('/api/perfil/me', {
        biografia,
        enlaces: enlaces.filter((e) => e.etiqueta.trim() && e.url.trim()),
        obrasDestacadas: obras.filter((o) => o.titulo.trim() && o.rutaImagen).map((o) => ({ titulo: o.titulo, rutaImagen: o.rutaImagen })),
      });
      setPerfil(data);
      setEditando(false);
    } catch (err) {
      setError(extraerMensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) {
    return <div className="p-16 text-center text-paper-muted">Cargando…</div>;
  }
  if (error && !perfil) {
    return <p className="mx-auto max-w-xl px-4 py-16 text-center text-coral-light">{error}</p>;
  }
  if (!perfil) return null;

  const esPropio = perfil.esPropio && sesion;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card overflow-hidden">
        <div className="h-28 bg-gradient-to-br from-coral/30 via-violet/20 to-teal/20" />
        <div className="px-6 pb-6">
          <div className="-mt-12 flex items-end justify-between">
            <div className="relative">
              <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-2xl border-4 border-ink-900 bg-ink-700 text-2xl font-semibold uppercase shadow-lg">
                {perfil.fotoUrl ? <img src={perfil.fotoUrl} alt={perfil.nombreArtista} className="h-full w-full object-cover" /> : perfil.nombreArtista.slice(0, 2)}
              </div>
              {esPropio && (
                <label className="absolute -bottom-1 -right-1 grid h-7 w-7 cursor-pointer place-items-center rounded-full bg-coral text-xs text-ink-950 shadow-glow-coral">
                  {subiendoFoto ? '…' : '✎'}
                  <input type="file" accept="image/*" className="hidden" onChange={subirFoto} />
                </label>
              )}
            </div>
            {esPropio && !editando && (
              <Button variant="secondary" onClick={() => setEditando(true)}>
                Editar perfil
              </Button>
            )}
          </div>

          <h1 className="mt-4 font-display text-2xl font-semibold">{perfil.nombreArtista}</h1>

          {!editando ? (
            <>
              <p className="mt-2 whitespace-pre-line text-sm text-paper-muted">{perfil.biografia || 'Sin biografía todavía.'}</p>
              {perfil.enlaces.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {perfil.enlaces.map((e, i) => (
                    <a key={i} href={e.url} target="_blank" rel="noreferrer" className="chip text-xs hover:border-teal/40 hover:text-teal">
                      {e.etiqueta} ↗
                    </a>
                  ))}
                </div>
              )}
              {perfil.obrasDestacadas.length > 0 && (
                <div className="mt-6">
                  <p className="label mb-2">Obras destacadas</p>
                  <div className="grid grid-cols-3 gap-3">
                    {perfil.obrasDestacadas.map((o, i) => (
                      <div key={i} className="overflow-hidden rounded-xl">
                        <img src={o.imagenUrl} alt={o.titulo} className="aspect-square w-full object-cover" />
                        <p className="mt-1 truncate text-xs text-paper-muted">{o.titulo}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="mt-4 flex flex-col gap-5">
              <div>
                <p className="label mb-1.5">Biografía</p>
                <textarea
                  className="input min-h-[90px] resize-y"
                  maxLength={500}
                  value={biografia}
                  onChange={(e) => setBiografia(e.target.value)}
                  placeholder="Contales a los demás qué haces…"
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="label">Enlaces (máx. 5)</p>
                  {enlaces.length < 5 && (
                    <button
                      type="button"
                      className="text-xs text-violet hover:underline"
                      onClick={() => setEnlaces((prev) => [...prev, { etiqueta: '', url: '' }])}
                    >
                      + agregar
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  {enlaces.map((en, i) => (
                    <div key={i} className="flex gap-2">
                      <TextField
                        placeholder="Instagram"
                        value={en.etiqueta}
                        onChange={(e) => setEnlaces((prev) => prev.map((x, j) => (j === i ? { ...x, etiqueta: e.target.value } : x)))}
                        className="w-32"
                      />
                      <TextField
                        placeholder="https://…"
                        value={en.url}
                        onChange={(e) => setEnlaces((prev) => prev.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                        className="flex-1"
                      />
                      <button type="button" className="text-coral-light" onClick={() => setEnlaces((prev) => prev.filter((_, j) => j !== i))}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="label">Obras destacadas (máx. 3)</p>
                  {obras.length < 3 && (
                    <label className="cursor-pointer text-xs text-violet hover:underline">
                      + agregar imagen
                      <input type="file" accept="image/*" className="hidden" onChange={agregarObra} />
                    </label>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {obras.map((o, i) => (
                    <div key={i} className="relative overflow-hidden rounded-xl">
                      <img src={o.previewUrl} alt="" className="aspect-square w-full object-cover" />
                      <input
                        className="mt-1 w-full rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-xs"
                        placeholder="Título"
                        value={o.titulo}
                        onChange={(e) => setObras((prev) => prev.map((x, j) => (j === i ? { ...x, titulo: e.target.value } : x)))}
                      />
                      <button
                        type="button"
                        className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-ink-950/70 text-xs text-coral-light"
                        onClick={() => setObras((prev) => prev.filter((_, j) => j !== i))}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {error && <p className="rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral-light">{error}</p>}

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEditando(false)}>
                  Cancelar
                </Button>
                <Button onClick={guardar} cargando={guardando}>
                  Guardar cambios
                </Button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
