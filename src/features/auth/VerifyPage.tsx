import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, extraerMensajeError } from '../../lib/api';

export function VerifyPage() {
  const [params] = useSearchParams();
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'error'>('cargando');
  const [mensaje, setMensaje] = useState('');
  const yaEnviadoRef = useRef(false);

  useEffect(() => {
    if (yaEnviadoRef.current) return;
    yaEnviadoRef.current = true;

    const token = params.get('token');
    if (!token) {
      setEstado('error');
      setMensaje('Falta el token de verificación en el enlace');
      return;
    }
    api
      .get('/api/auth/verificar', { params: { token } })
      .then(() => setEstado('ok'))
      .catch((err) => {
        setEstado('error');
        setMensaje(extraerMensajeError(err));
      });
  }, [params]);

  return (
    <div className="flex min-h-[calc(100vh-64px)] items-center justify-center px-4">
      <div className="card w-full max-w-md p-8 text-center">
        {estado === 'cargando' && <p className="text-paper-muted">Verificando tu cuenta…</p>}
        {estado === 'ok' && (
          <>
            <h1 className="mb-2 text-xl font-semibold text-teal">¡Cuenta confirmada!</h1>
            <p className="mb-6 text-sm text-paper-muted">Ya puedes iniciar sesión.</p>
            <Link to="/login" className="btn-primary">
              Ir a iniciar sesión
            </Link>
          </>
        )}
        {estado === 'error' && (
          <>
            <h1 className="mb-2 text-xl font-semibold text-coral">No se pudo verificar</h1>
            <p className="text-sm text-paper-muted">{mensaje}</p>
          </>
        )}
      </div>
    </div>
  );
}
