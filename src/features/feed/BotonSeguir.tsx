import { useState } from 'react';
import { api, extraerMensajeError } from '../../lib/api';
import { Button } from '../../components/ui/Button';

interface Props {
  usuarioId: string;
  loSigo: boolean;
  /** Avisa el nuevo estado para que quien lo usa actualice contadores o recargue el feed. */
  onCambio?: (loSigo: boolean) => void;
  className?: string;
}

export function BotonSeguir({ usuarioId, loSigo, onCambio, className }: Props) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function alternar() {
    setEnviando(true);
    setError(null);
    try {
      if (loSigo) {
        await api.delete(`/api/artistas/${usuarioId}/seguir`);
      } else {
        await api.post(`/api/artistas/${usuarioId}/seguir`);
      }
      onCambio?.(!loSigo);
    } catch (err) {
      setError(extraerMensajeError(err, 'No se pudo actualizar'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        variant={loSigo ? 'secondary' : 'primary'}
        cargando={enviando}
        onClick={alternar}
        className={className}
        title={loSigo ? 'Dejar de seguir' : 'Seguir a este artista'}
      >
        {loSigo ? 'Siguiendo' : 'Seguir'}
      </Button>
      {error && <span className="text-[11px] text-coral-light">{error}</span>}
    </span>
  );
}
