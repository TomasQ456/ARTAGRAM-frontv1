import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api, extraerMensajeError } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { FondoEstudio } from '../../components/layout/FondoEstudio';
import { TextField } from '../../components/ui/TextField';
import type { SalaFiestaResponse } from '../../types';

export function PartyLobbyPage() {
  const navigate = useNavigate();
  const [duracion, setDuracion] = useState(60);
  const [cupo, setCupo] = useState(8);
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [uniendo, setUniendo] = useState(false);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreando(true);
    try {
      const { data } = await api.post<SalaFiestaResponse>('/api/fiestas', { duracionRondaSegundos: duracion, cupoMaximo: cupo });
      navigate(`/fiesta/${data.id}`);
    } catch (err) {
      setError(extraerMensajeError(err));
    } finally {
      setCreando(false);
    }
  }

  async function unirse(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setUniendo(true);
    try {
      const { data } = await api.post<SalaFiestaResponse>('/api/fiestas/unirse', null, { params: { codigo: codigo.trim() } });
      navigate(`/fiesta/${data.id}`);
    } catch (err) {
      setError(extraerMensajeError(err, 'No encontramos una sala con ese código'));
    } finally {
      setUniendo(false);
    }
  }

  return (
    <FondoEstudio>
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8 text-center">
        <span className="chip mb-3 inline-block border-amber/40 text-amber">Rondas cronometradas</span>
        <h1 className="font-display text-3xl font-semibold">Modo fiesta</h1>
        <p className="mt-2 text-paper-muted">
          Todos pintan con el mismo pincel y color durante la ronda. Nadie borra… salvo quien logre tomar el borrador.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <motion.form
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={crear}
          className="card flex flex-col gap-4 p-6"
        >
          <h2 className="font-display text-lg font-semibold text-coral">Crear una sala</h2>
          <TextField
            label="Duración de la ronda (segundos)"
            type="number"
            min={5}
            max={600}
            value={duracion}
            onChange={(e) => setDuracion(Number(e.target.value))}
          />
          <TextField
            label="Cupo máximo"
            type="number"
            min={2}
            max={50}
            value={cupo}
            onChange={(e) => setCupo(Number(e.target.value))}
          />
          <Button type="submit" cargando={creando}>
            Crear sala
          </Button>
        </motion.form>

        <motion.form
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          onSubmit={unirse}
          className="card flex flex-col gap-4 p-6"
        >
          <h2 className="font-display text-lg font-semibold text-violet">Unirme con un código</h2>
          <TextField
            label="Código de la sala"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            placeholder="AB12CD"
            maxLength={6}
          />
          <Button type="submit" variant="secondary" cargando={uniendo} className="mt-auto">
            Entrar a la sala
          </Button>
        </motion.form>
      </div>

      {error && <p className="mt-6 rounded-lg bg-coral/10 px-3 py-2 text-center text-sm text-coral-light">{error}</p>}
    </div>
    </FondoEstudio>
  );
}
