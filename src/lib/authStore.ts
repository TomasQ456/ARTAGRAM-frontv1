import { create } from 'zustand';

export interface SesionUsuario {
  accessToken: string;
  usuarioId: string;
  nombreArtista: string;
  rolGlobal: string;
  premium: boolean;
}

interface AuthState {
  sesion: SesionUsuario | null;
  /**
   * Bandera reactiva (no sessionStorage): LoginPage la lee directo del store
   * en cada render, así que no importa si el componente se monta antes o
   * despues de la redireccion, ni cuantas veces framer-motion lo remonte
   * durante la transicion de ruta — no hay ventana de carrera "quien la
   * consume primero" como la habria con un valor que se borra al leerlo.
   */
  sesionExpirada: boolean;
  iniciarSesion: (sesion: SesionUsuario) => void;
  cerrarSesion: () => void;
  expirarSesion: () => void;
  limpiarAvisoSesionExpirada: () => void;
}

const CLAVE_STORAGE = 'artagram.sesion';

function cargarSesionInicial(): SesionUsuario | null {
  try {
    const crudo = localStorage.getItem(CLAVE_STORAGE);
    return crudo ? (JSON.parse(crudo) as SesionUsuario) : null;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  sesion: cargarSesionInicial(),
  sesionExpirada: false,
  iniciarSesion: (sesion) => {
    localStorage.setItem(CLAVE_STORAGE, JSON.stringify(sesion));
    set({ sesion, sesionExpirada: false });
  },
  cerrarSesion: () => {
    localStorage.removeItem(CLAVE_STORAGE);
    set({ sesion: null, sesionExpirada: false });
  },
  expirarSesion: () => {
    localStorage.removeItem(CLAVE_STORAGE);
    set({ sesion: null, sesionExpirada: true });
  },
  limpiarAvisoSesionExpirada: () => set({ sesionExpirada: false }),
}));

export function obtenerTokenActual(): string | null {
  return useAuthStore.getState().sesion?.accessToken ?? null;
}
