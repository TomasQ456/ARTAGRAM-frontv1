import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../lib/authStore';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const sesion = useAuthStore((s) => s.sesion);
  if (!sesion) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
