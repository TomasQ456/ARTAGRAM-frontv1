import { type ReactNode } from 'react';

/**
 * Fondo decorativo para las páginas "de estudio" (feed, comunidades, modo
 * fiesta, mensajes): el mismo patrón de íconos con glow que FondoArtistico
 * pero en la paleta oscura de la app, para que estas pantallas se sientan
 * tan vivas como landing/login en vez de un gris plano. Fixed detrás del
 * header igual que FondoArtistico; las .card ya son semitransparentes con
 * blur, así que quedan flotando sobre la textura sin perder legibilidad.
 */
export function FondoEstudio({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate min-h-[calc(100vh-64px)]">
      <div
        className="fixed inset-0 -z-20 bg-ink-950"
        style={{ backgroundImage: "url('/fondo-estudio.svg')", backgroundSize: '380px 380px' }}
      />
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-ink-950/70 via-ink-950/55 to-ink-950/80" />
      {children}
    </div>
  );
}
