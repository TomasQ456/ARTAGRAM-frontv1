import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api, extraerMensajeError } from '../../lib/api';
import { FondoArtistico } from '../../components/layout/FondoArtistico';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';

export function RegisterPage() {
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [nombreArtista, setNombreArtista] = useState('');
  const [disponibilidad, setDisponibilidad] = useState<{ disponible: boolean; sugerencias: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    if (nombreArtista.trim().length < 3) {
      setDisponibilidad(null);
      return;
    }
    const controlador = new AbortController();
    const temporizador = setTimeout(() => {
      api
        .get('/api/auth/nombre-disponible', { params: { nombre: nombreArtista }, signal: controlador.signal })
        .then((r) => setDisponibilidad(r.data))
        .catch(() => {});
    }, 350);
    return () => {
      clearTimeout(temporizador);
      controlador.abort();
    };
  }, [nombreArtista]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await api.post('/api/auth/registro', { correo, password, nombreArtista });
      setListo(true);
    } catch (err) {
      setError(extraerMensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  if (listo) {
    return (
      <CentroAuth>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card-light p-8 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-teal/15 text-teal-dark">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 12l5 5L20 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="mb-2 text-xl font-semibold text-ink-950">Revisa tu bandeja de entrada</h1>
          <p className="text-sm text-ink-950/65">
            Te mandamos un enlace para confirmar la cuenta de <strong className="text-ink-950">{correo}</strong>. En este
            entorno de desarrollo, el enlace queda registrado en los logs del backend en vez de llegar por correo real.
          </p>
          <Link to="/login" className="btn-secondary mt-6 !bg-paper/80 !text-ink-950 !border-ink-950/15 hover:!text-violet-dark">
            Ya la confirmé, entrar
          </Link>
        </motion.div>
      </CentroAuth>
    );
  }

  return (
    <CentroAuth>
      <motion.form
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={enviar}
        className="card-light flex w-full max-w-md flex-col gap-4 p-8"
      >
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-950">Crea tu cuenta</h1>
          <p className="mt-1 text-sm text-ink-950/65">Empieza a publicar tu proceso y a dibujar con otros.</p>
        </div>

        <TextField
          label="Correo"
          type="email"
          required
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          placeholder="tu@correo.com"
          variant="light"
        />
        <TextField
          label="Contraseña"
          type="password"
          required
          minLength={10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          ayuda="Al menos 10 caracteres"
          variant="light"
        />
        <div>
          <TextField
            label="Nombre de artista"
            required
            value={nombreArtista}
            onChange={(e) => setNombreArtista(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
            error={disponibilidad?.disponible === false ? 'Ese nombre ya lo tiene otra persona' : undefined}
            placeholder="lienzo_azul"
            variant="light"
          />
          {disponibilidad?.disponible === false && disponibilidad.sugerencias.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {disponibilidad.sugerencias.map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => setNombreArtista(s)}
                  className="chip !bg-paper/70 !text-ink-950/70 !border-ink-950/15 hover:!border-violet hover:!text-violet-dark"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && <p className="rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral-dark">{error}</p>}

        <Button type="submit" cargando={enviando} disabled={disponibilidad?.disponible === false}>
          Crear cuenta
        </Button>

        <p className="text-center text-sm text-ink-950/65">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="font-medium text-violet-dark hover:underline">
            Inicia sesión
          </Link>
        </p>
      </motion.form>
    </CentroAuth>
  );
}

function CentroAuth({ children }: { children: React.ReactNode }) {
  return (
    <FondoArtistico>
      <div className="flex min-h-[calc(100vh-64px)] items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </FondoArtistico>
  );
}
