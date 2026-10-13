import { Link, useParams } from 'react-router-dom';
import { CommunityBannerMural } from '../community/CommunityBannerMural';

export function BannerMuralPage() {
  const { id: comunidadId } = useParams<{ id: string }>();

  if (!comunidadId) return null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label">Mural Comunitario Permanente · 1000×1000</p>
          <h1 className="font-display text-2xl font-semibold">Lienzo Mural de la Comunidad</h1>
          <p className="text-xs text-paper-muted">
            Dibuja con la barra de herramientas completa del modo fiesta. Tus trazos quedan grabados permanentemente y decoran el fondo de la comunidad.
          </p>
        </div>
        <Link to={`/comunidades/${comunidadId}`} className="btn-ghost text-xs">
          ← Volver a la comunidad
        </Link>
      </div>

      <div className="card overflow-hidden p-4 border-ink-800 bg-ink-950 shadow-2xl">
        <CommunityBannerMural comunidadId={comunidadId} interactivo={true} alturaPx={620} />
      </div>
    </div>
  );
}
