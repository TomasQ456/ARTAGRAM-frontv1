import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../lib/authStore';

/**
 * No alcanza con esconder el link "Admin" del menú (HU-38): cualquiera podría
 * escribir /admin en la barra de direcciones. Esta guarda redirige a quien no
 * tenga rolGlobal=ADMIN antes de que la página llegue a pedir nada al backend.
 */
export function AdminRoute({ children }: { children: ReactNode }) {
  const sesion = useAuthStore((s) => s.sesion);
  if (!sesion) {
    return <Navigate to="/login" replace />;
  }
  if (sesion.rolGlobal !== 'ADMIN') {
    return <Navigate to="/feed" replace />;
  }
  return <>{children}</>;
}
