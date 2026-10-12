import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api, extraerMensajeError } from '../../lib/api';
import { useAuthStore } from '../../lib/authStore';
import { FondoArtistico } from '../../components/layout/FondoArtistico';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';

export function LoginPage() {
  const navigate = useNavigate();
  const iniciarSesion = useAuthStore((s) => s.iniciarSesion);
  const avisoExpirada = useAuthStore((s) => s.sesionExpirada);
  const limpiarAvisoSesionExpirada = useAuthStore((s) => s.limpiarAvisoSesionExpirada);
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Se apaga sola al salir de /login: si el usuario vuelve mas tarde sin
  // haber sido redirigido por una sesion vencida, no deberia ver el aviso.
  useEffect(() => () => limpiarAvisoSesionExpirada(), [limpiarAvisoSesionExpirada]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const { data } = await api.post('/api/auth/login', { correo, password });
      iniciarSesion(data);
      navigate('/feed');
    } catch (err) {
      setError(extraerMensajeError(err, 'Correo o contraseña incorrectos'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <FondoArtistico>
      <div className="flex min-h-[calc(100vh-64px)] items-center justify-center px-4 py-12">
        <motion.form
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={enviar}
          className="card-light flex w-full max-w-md flex-col gap-4 p-8"
        >
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink-950">Bienvenido de vuelta</h1>
            <p className="mt-1 text-sm text-ink-950/65">Entra para seguir dibujando con tu comunidad.</p>
          </div>

          {avisoExpirada && (
            <p className="rounded-lg bg-violet/10 px-3 py-2 text-sm text-violet-dark">
              Tu sesión expiró, inicia sesión de nuevo.
            </p>
          )}

          <TextField
            label="Correo"
            type="email"
            required
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            variant="light"
          />
          <TextField
            label="Contraseña"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            variant="light"
          />

          {error && <p className="rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral-dark">{error}</p>}

          <Button type="submit" cargando={enviando}>
            Entrar
          </Button>

          <p className="text-center text-sm text-ink-950/65">
            ¿Aún no tienes cuenta?{' '}
            <Link to="/registro" className="font-medium text-violet-dark hover:underline">
              Regístrate
            </Link>
          </p>
        </motion.form>
      </div>
    </FondoArtistico>
  );
}
