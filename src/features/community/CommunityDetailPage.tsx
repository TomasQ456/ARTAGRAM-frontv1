import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, extraerMensajeError } from '../../lib/api';
import { useAuthStore } from '../../lib/authStore';
import type { ComunidadResponse } from '../../types';
import { ComunidadChatPanel } from '../chat/ComunidadChatPanel';
import { CommunityBannerMural } from './CommunityBannerMural';
import { CommunityAdminPanel } from './CommunityAdminPanel';
import { Button } from '../../components/ui/Button';

export function CommunityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const sesion = useAuthStore((s) => s.sesion);

  const [comunidad, setComunidad] = useState<ComunidadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [pintandoBanner, setPintandoBanner] = useState(false);
  const [mostrarPanelAdmin, setMostrarPanelAdmin] = useState(false);

  useEffect(() => {
    cargarComunidad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function cargarComunidad() {
    if (!id) return;
    api
      .get<ComunidadResponse>(`/api/comunidades/${id}`)
      .then((r) => setComunidad(r.data))
      .catch((err) => setError(extraerMensajeError(err)));
  }

  function copiarId() {
    if (!comunidad) return;
    navigator.clipboard.writeText(comunidad.id);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  if (error) {
    return <p className="mx-auto max-w-xl px-4 py-16 text-center text-coral-light">{error}</p>;
  }
  if (!comunidad || !id) {
    return <div className="p-8 text-center text-paper-muted">Cargando…</div>;
  }

  const esAdmin =
    comunidad.miRol === 'ADMIN' ||
    comunidad.miRol === 'MODERADOR' ||
    sesion?.rolGlobal === 'ADMIN' ||
    comunidad.creador === sesion?.nombreArtista;
  const esCreador = comunidad.creador === sesion?.nombreArtista;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* HEADER DE LA COMUNIDAD CON EL MURAL BANNER PERMANENTE EN EL FONDO */}
      <div className="relative mb-6 overflow-hidden rounded-2xl border border-ink-800 bg-ink-950 shadow-2xl">
        {/* Mural en el fondo de la cabecera */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          <CommunityBannerMural comunidadId={id} interactivo={false} alturaPx={280} />
          {/* Degradado artístico suave para legibilidad de textos */}
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/75 to-ink-950/25 pointer-events-none" />
        </div>

        {/* Contenido sobre el banner */}
        <div className="relative z-10 p-6 md:p-8 flex flex-col justify-between gap-6 min-h-[220px]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip">{comunidad.publica ? 'Pública' : 'Privada'}</span>
              <span className="chip border-violet/40 text-violet">Tu rol: {comunidad.miRol ?? 'Visitante'}</span>
            </div>

            {/* Acciones principales */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => setPintandoBanner((v) => !v)}
                className="backdrop-blur-md bg-ink-900/80 border-ink-700 text-xs py-1.5 px-3"
              >
                {pintandoBanner ? 'Ocultar pintor' : '🎨 Pintar en el mural'}
              </Button>

              {esAdmin && (
                <Button
                  variant={mostrarPanelAdmin ? 'primary' : 'secondary'}
                  onClick={() => setMostrarPanelAdmin((v) => !v)}
                  className="backdrop-blur-md bg-violet/20 border-violet/40 text-violet-light hover:bg-violet/30 text-xs py-1.5 px-3"
                >
                  🛡️ {mostrarPanelAdmin ? 'Cerrar panel' : 'Panel de Control'}
                </Button>
              )}
            </div>
          </div>

          <div>
            <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight text-paper drop-shadow-md">
              {comunidad.nombre}
            </h1>
            <p className="mt-2 max-w-2xl text-sm md:text-base text-paper-muted drop-shadow-sm">
              {comunidad.descripcion || 'Sin descripción'}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-paper-muted">
              <span>Creada por <strong className="text-paper">@{comunidad.creador}</strong></span>
              <span>·</span>
              <span><strong className="text-paper">{comunidad.totalMiembros}</strong> miembros</span>
              <span>·</span>

              {/* ID DE LA COMUNIDAD CLARAMENTE VISIBLE Y COPIABLE */}
              <div className="flex items-center gap-1.5 rounded-lg border border-ink-700/80 bg-ink-900/80 px-2.5 py-1 font-mono backdrop-blur-sm">
                <span className="text-paper-dim">ID:</span>
                <span className="text-paper font-semibold select-all">{comunidad.id}</span>
                <button
                  type="button"
                  onClick={copiarId}
                  className="ml-1 text-violet hover:text-coral transition-colors font-sans text-[11px]"
                  title="Copiar ID de la comunidad"
                >
                  {copiado ? '✓ Copiado' : '📋 Copiar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MURAL INTERACTIVO EXPANDIBLE ESTILO MODO FIESTA */}
      {pintandoBanner && (
        <div className="mb-6 card p-6 border-coral/30 bg-ink-900/95 shadow-2xl backdrop-blur-md">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold text-coral">Lienzo Mural de la Comunidad</h2>
              <p className="text-xs text-paper-muted">
                Dibuja con cualquier pincel o borrador de forma continua. Tus trazos quedan grabados permanentemente en el mural.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPintandoBanner(false)}
              className="text-paper-muted hover:text-coral transition-colors"
            >
              ✕ Cerrar
            </button>
          </div>
          <CommunityBannerMural
            comunidadId={id}
            interactivo={true}
            alturaPx={450}
            onCerrarEdicion={() => setPintandoBanner(false)}
          />
        </div>
      )}

      {/* PANEL DE CONTROL DE ADMINISTRADOR */}
      {mostrarPanelAdmin && esAdmin && (
        <div className="mb-6">
          <CommunityAdminPanel
            comunidad={comunidad}
            esAdmin={esAdmin}
            esCreador={esCreador}
            onMiembrosActualizados={cargarComunidad}
          />
        </div>
      )}

      {/* ACCESOS DIRECTOS AL LIENZO COMPARTIDO Y AL BANNER */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Link to={`/comunidades/${id}/lienzo`} className="card group relative overflow-hidden p-6 lg:col-span-2">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-coral/20 blur-2xl transition-transform group-hover:scale-125" />
          <h2 className="font-display text-xl font-semibold text-coral group-hover:underline">Lienzo compartido en vivo →</h2>
          <p className="mt-2 max-w-md text-sm text-paper-muted">
            Dibuja en tiempo real con quien esté conectado. Cursores con nombres y actualización continua de trazos.
          </p>
        </Link>

        <Link to={`/comunidades/${id}/banner`} className="card group relative overflow-hidden p-6">
          <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-violet/20 blur-2xl transition-transform group-hover:scale-125" />
          <h2 className="font-display text-xl font-semibold text-violet group-hover:underline">Pintor de mural permanente →</h2>
          <p className="mt-2 text-sm text-paper-muted">
            Accede al lienzo permanente de 1000×1000 píxeles que da vida al fondo de tu comunidad.
          </p>
        </Link>
      </div>

      {/* CHAT DE LA COMUNIDAD */}
      <div className="mt-6">
        <ComunidadChatPanel comunidadId={id} />
      </div>
    </div>
  );
}
