import { type ReactNode } from 'react';

/**
 * Fondo de acuarela para las páginas públicas (landing, login, registro).
 * Fixed para que quede detrás también del header; el degradé de paper
 * encima asegura que el texto oscuro de estas páginas siga siendo legible
 * sin tapar del todo la ilustración.
 */
export function FondoArtistico({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate min-h-[calc(100vh-64px)]">
      <div
        className="fixed inset-0 -z-20 bg-cover bg-center"
        style={{ backgroundImage: "url('/fondo-artistico.jpg')" }}
      />
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-paper/25 via-paper/35 to-paper/55" />
      {children}
    </div>
  );
}
