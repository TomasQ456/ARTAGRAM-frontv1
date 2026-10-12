import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, extraerMensajeError } from '../../lib/api';
import type { ComunidadResponse } from '../../types';
import { ComunidadChatPanel } from '../chat/ComunidadChatPanel';

export function CommunityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [comunidad, setComunidad] = useState<ComunidadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .get<ComunidadResponse>(`/api/comunidades/${id}`)
      .then((r) => setComunidad(r.data))
      .catch((err) => setError(extraerMensajeError(err)));
  }, [id]);

  if (error) {
    return <p className="mx-auto max-w-xl px-4 py-16 text-center text-coral-light">{error}</p>;
  }
  if (!comunidad || !id) {
    return <div className="p-8 text-center text-paper-muted">Cargando…</div>;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <span className="chip">{comunidad.publica ? 'Pública' : 'Privada'}</span>
          <h1 className="mt-2 font-display text-3xl font-semibold">{comunidad.nombre}</h1>
          <p className="mt-1 text-sm text-paper-muted">
            {comunidad.descripcion || 'Sin descripción'} · creada por {comunidad.creador} · {comunidad.totalMiembros} miembros
          </p>
        </div>
        <span className="chip border-violet/40 text-violet">Tu rol: {comunidad.miRol}</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Link to={`/comunidades/${id}/lienzo`} className="card group relative overflow-hidden p-6 lg:col-span-2">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-coral/20 blur-2xl transition-transform group-hover:scale-125" />
          <h2 className="font-display text-xl font-semibold text-coral">Lienzo compartido →</h2>
          <p className="mt-2 max-w-md text-sm text-paper-muted">
            Dibuja en tiempo real con quien esté conectado. Los trazos se ven aparecer igual en todas las pantallas.
          </p>
        </Link>

        <Link to={`/comunidades/${id}/banner`} className="card group relative overflow-hidden p-6">
          <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-violet/20 blur-2xl transition-transform group-hover:scale-125" />
          <h2 className="font-display text-xl font-semibold text-violet">Banner mural →</h2>
          <p className="mt-2 text-sm text-paper-muted">El mural 1000×1000 de la comunidad, partido en regiones.</p>
        </Link>
      </div>

      <div className="mt-6">
        <ComunidadChatPanel comunidadId={id} />
      </div>
    </div>
  );
}
