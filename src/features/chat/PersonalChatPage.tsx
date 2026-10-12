import { useEffect, useRef, useState } from 'react';
import { api, extraerMensajeError } from '../../lib/api';
import { stompService } from '../../lib/stompClient';
import { useAuthStore } from '../../lib/authStore';
import { Button } from '../../components/ui/Button';
import { FondoEstudio } from '../../components/layout/FondoEstudio';
import { TextField } from '../../components/ui/TextField';
import type { MensajePersonalDto, PerfilResponse } from '../../types';

export function PersonalChatPage() {
  const sesion = useAuthStore((s) => s.sesion);
  const [nombreDestino, setNombreDestino] = useState('');
  const [destinatarioId, setDestinatarioId] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<MensajePersonalDto[]>([]);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sesion) return;
    stompService.conectar(sesion.accessToken);
    const desuscribir = stompService.suscribir<MensajePersonalDto>('/user/queue/mensajes', (m) => {
      setMensajes((prev) => {
        if (prev.some((x) => x.id === m.id)) return prev;
        return [...prev, m].sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
      });
    });
    return desuscribir;
  }, [sesion]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes.length]);

  async function buscarYAbrir(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { data } = await api.get<PerfilResponse>(`/api/perfiles/${nombreDestino}`);
      setDestinatarioId(data.usuarioId);
      const historial = await api.get<MensajePersonalDto[]>(`/api/mensajes/con/${data.usuarioId}`);
      setMensajes(historial.data);
    } catch (err) {
      setError(extraerMensajeError(err, 'No encontramos a ese artista'));
    }
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim() || !destinatarioId) return;
    stompService.publicar('/app/mensajes/enviar', { destinatarioId, contenido: texto.trim() });
    setTexto('');
  }

  return (
    <FondoEstudio>
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-4 font-display text-2xl font-semibold">Mensajes</h1>
      <form onSubmit={buscarYAbrir} className="card mb-4 flex items-end gap-2 p-4">
        <TextField
          label="Nombre de artista"
          value={nombreDestino}
          onChange={(e) => setNombreDestino(e.target.value)}
          placeholder="lienzo_azul"
          className="flex-1"
        />
        <Button type="submit">Abrir chat</Button>
      </form>
      {error && <p className="mb-4 rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral-light">{error}</p>}

      {destinatarioId && (
        <div className="card flex h-[28rem] flex-col p-4">
          <div className="flex-1 space-y-2 overflow-y-auto pr-1">
            {mensajes.map((m) => (
              <div key={m.id} className={m.remitenteId === sesion?.usuarioId ? 'text-right' : ''}>
                <span className="inline-block max-w-[75%] rounded-2xl bg-ink-700 px-3 py-1.5 text-left text-sm">
                  {m.contenido}
                </span>
                {m.remitenteId === sesion?.usuarioId && (
                  <div className="mt-0.5 text-[10px] text-paper-dim">{m.entregado ? 'entregado' : 'enviando…'}</div>
                )}
              </div>
            ))}
            <div ref={finRef} />
          </div>
          <form onSubmit={enviar} className="mt-3 flex gap-2">
            <input className="input" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe…" maxLength={2000} />
            <button className="btn-primary px-4">Enviar</button>
          </form>
        </div>
      )}
    </div>
    </FondoEstudio>
  );
}
