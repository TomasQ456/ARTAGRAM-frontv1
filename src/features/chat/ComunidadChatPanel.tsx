import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { stompService } from '../../lib/stompClient';
import { useAuthStore } from '../../lib/authStore';
import type { MensajeComunidadDto } from '../../types';

export function ComunidadChatPanel({ comunidadId }: { comunidadId: string }) {
  const sesion = useAuthStore((s) => s.sesion);
  const [mensajes, setMensajes] = useState<MensajeComunidadDto[]>([]);
  const [texto, setTexto] = useState('');
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get<MensajeComunidadDto[]>(`/api/comunidades/${comunidadId}/chat`).then((r) => setMensajes(r.data));
    if (sesion) stompService.conectar(sesion.accessToken);
    const desuscribir = stompService.suscribir<MensajeComunidadDto>(`/topic/comunidad/${comunidadId}/chat`, (m) =>
      setMensajes((prev) => [...prev, m]),
    );
    return desuscribir;
  }, [comunidadId, sesion]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes.length]);

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    stompService.publicar(`/app/comunidad/${comunidadId}/chat/enviar`, { contenido: texto.trim() });
    setTexto('');
  }

  return (
    <div className="card flex h-96 flex-col p-4">
      <h3 className="mb-2 font-display text-lg font-semibold">Chat de la comunidad</h3>
      <div className="flex-1 space-y-2 overflow-y-auto pr-1">
        {mensajes.length === 0 && <p className="mt-8 text-center text-sm text-paper-dim">Todavía no hay mensajes</p>}
        {mensajes.map((m) => (
          <div key={m.id} className={m.remitenteId === sesion?.usuarioId ? 'text-right' : ''}>
            <span className="inline-block max-w-[80%] rounded-2xl bg-ink-700 px-3 py-1.5 text-left text-sm">
              <span className="mr-1.5 font-medium text-violet">{m.remitenteNombre}</span>
              {m.contenido}
            </span>
          </div>
        ))}
        <div ref={finRef} />
      </div>
      <form onSubmit={enviar} className="mt-3 flex gap-2">
        <input
          className="input"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribe un mensaje…"
          maxLength={500}
        />
        <button type="submit" className="btn-primary px-4">
          Enviar
        </button>
      </form>
    </div>
  );
}
