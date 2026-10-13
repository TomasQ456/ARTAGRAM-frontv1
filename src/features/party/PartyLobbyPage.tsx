import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api, extraerMensajeError } from '../../lib/api';
import { useAuthStore } from '../../lib/authStore';
import { Button } from '../../components/ui/Button';
import { FondoEstudio } from '../../components/layout/FondoEstudio';
import { TextField } from '../../components/ui/TextField';
import { CodigoSalaBadge } from './CodigoSalaBadge';
import type { SalaFiestaResponse } from '../../types';

export function PartyLobbyPage() {
  const navigate = useNavigate();
  const sesion = useAuthStore((s) => s.sesion);

  const [duracion, setDuracion] = useState(60);
  const [cupo, setCupo] = useState(8);
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [creando, setCreando] = useState(false);
  const [uniendo, setUniendo] = useState(false);

  // Salas activas en las que participa el usuario
  const [salasActivas, setSalasActivas] = useState<SalaFiestaResponse[]>([]);
  const [cargandoSalas, setCargandoSalas] = useState(true);
  const [limpiando, setLimpiando] = useState(false);

  const cargarSalasActivas = useCallback(async () => {
    try {
      const { data } = await api.get<SalaFiestaResponse[]>('/api/fiestas/activas');
      setSalasActivas(data);
    } catch {
      // Ignorar fallo silencioso
    } finally {
      setCargandoSalas(false);
    }
  }, []);

  useEffect(() => {
    if (sesion) {
      cargarSalasActivas();
    }
  }, [sesion, cargarSalasActivas]);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreando(true);
    try {
      const { data } = await api.post<SalaFiestaResponse>('/api/fiestas', {
        duracionRondaSegundos: duracion,
        cupoMaximo: cupo,
      });
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
      const { data } = await api.post<SalaFiestaResponse>('/api/fiestas/unirse', null, {
        params: { codigo: codigo.trim() },
      });
      navigate(`/fiesta/${data.id}`);
    } catch (err) {
      setError(extraerMensajeError(err, 'No encontramos una sala con ese código'));
    } finally {
      setUniendo(false);
    }
  }

  async function cerrarSala(salaId: string) {
    try {
      await api.delete(`/api/fiestas/${salaId}`);
      setSalasActivas((prev) => prev.filter((s) => s.id !== salaId));
      setAviso('Sala cerrada exitosamente.');
      setTimeout(() => setAviso(null), 3000);
    } catch (err) {
      setError(extraerMensajeError(err, 'No se pudo cerrar la sala'));
    }
  }

  async function salirDeSala(salaId: string) {
    try {
      await api.post(`/api/fiestas/${salaId}/salir`);
      setSalasActivas((prev) => prev.filter((s) => s.id !== salaId));
      setAviso('Has salido de la sala.');
      setTimeout(() => setAviso(null), 3000);
    } catch (err) {
      setError(extraerMensajeError(err, 'No se pudo salir de la sala'));
    }
  }

  async function limpiarTodas() {
    setLimpiando(true);
    setError(null);
    try {
      await api.post('/api/fiestas/limpiar');
      setSalasActivas([]);
      setAviso('Todas tus salas activas han sido cerradas.');
      setTimeout(() => setAviso(null), 3500);
    } catch (err) {
      setError(extraerMensajeError(err, 'No se pudieron limpiar las salas'));
    } finally {
      setLimpiando(false);
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

        {/* Tarjetas de Crear y Unirse */}
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

        {error && (
          <p className="mt-6 rounded-lg bg-coral/10 border border-coral/30 px-3 py-2 text-center text-sm text-coral-light">
            {error}
          </p>
        )}

        {aviso && (
          <p className="mt-6 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 text-center text-sm text-emerald-400">
            {aviso}
          </p>
        )}

        {/* Sección: Salas activas en las que participa el usuario */}
        <div className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-xl font-bold text-paper">Tus salas activas</h2>
              <span className="rounded-full bg-ink-800 border border-ink-600 px-2 py-0.5 text-xs font-semibold text-paper-dim">
                {salasActivas.length}
              </span>
            </div>
            {salasActivas.length > 0 && (
              <button
                type="button"
                onClick={limpiarTodas}
                disabled={limpiando}
                className="text-xs text-coral-light hover:text-white px-3 py-1.5 rounded-lg bg-coral/10 hover:bg-coral/20 border border-coral/30 transition-colors"
                title="Cierra y finaliza todas las salas activas en las que participas"
              >
                {limpiando ? 'Cerrando...' : 'Cerrar todas las salas'}
              </button>
            )}
          </div>

          {cargandoSalas ? (
            <div className="card p-8 text-center text-sm text-paper-dim">Cargando salas activas...</div>
          ) : salasActivas.length === 0 ? (
            <div className="card p-8 text-center">
              <div className="w-12 h-12 rounded-full bg-ink-700/50 mx-auto flex items-center justify-center text-xl mb-3 text-paper-dim">
                🎉
              </div>
              <p className="text-sm font-medium text-paper">No tienes salas activas en este momento</p>
              <p className="text-xs text-paper-dim mt-1">
                Crea una sala arriba o ingresa con un código para empezar a pintar en grupo.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {salasActivas.map((s) => {
                const esAnfitrion = s.anfitrionNombre === sesion?.nombreArtista;
                const enRonda = s.estado === 'EN_RONDA';
                return (
                  <motion.div
                    key={s.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="card p-5 flex flex-col justify-between border-ink-700/80 hover:border-violet/40 transition-colors gap-4"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <CodigoSalaBadge codigo={s.codigo} />
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${
                            enRonda
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                              : 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              enRonda ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                            }`}
                          />
                          {enRonda ? `En ronda (#${s.numeroRonda})` : 'Esperando'}
                        </span>
                      </div>

                      <div className="space-y-1 text-xs">
                        <p className="text-paper-muted">
                          Anfitrión:{' '}
                          <span className="font-semibold text-paper">
                            {s.anfitrionNombre}
                            {esAnfitrion && ' (Tú)'}
                          </span>
                        </p>
                        <p className="text-paper-dim">
                          Participantes: <span className="text-paper">{s.totalParticipantes}</span> / {s.cupoMaximo}
                        </p>
                        <p className="text-paper-dim">Rondas de {s.duracionRondaSegundos}s</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-ink-700/60">
                      <Button
                        type="button"
                        onClick={() => navigate(`/fiesta/${s.id}`)}
                        className="flex-1 py-1.5 text-xs"
                      >
                        Entrar a la sala
                      </Button>
                      {esAnfitrion ? (
                        <button
                          type="button"
                          onClick={() => cerrarSala(s.id)}
                          className="px-3 py-1.5 text-xs text-coral-light hover:text-white rounded-full bg-coral/15 hover:bg-coral/30 border border-coral/40 transition-colors"
                          title="Cerrar la sala permanentemente para todos los participantes"
                        >
                          Cerrar
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => salirDeSala(s.id)}
                          className="px-3 py-1.5 text-xs text-paper-dim hover:text-paper rounded-full bg-ink-700 hover:bg-ink-600 transition-colors"
                          title="Salir de esta sala"
                        >
                          Salir
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </FondoEstudio>
  );
}
