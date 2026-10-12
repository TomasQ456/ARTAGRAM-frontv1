import { useState } from 'react';
import { motion } from 'framer-motion';

/**
 * El codigo de invitacion tiene que quedar siempre visible y facil de copiar:
 * es la unica forma que tienen los demas de unirse a esta sala, y antes vivia
 * escondido como texto chiquito junto al titulo (facil de no ver).
 */
export function CodigoSalaBadge({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      // Sin permiso de portapapeles: el codigo ya esta visible para copiarlo a mano.
    }
  }

  return (
    <motion.button
      type="button"
      onClick={copiar}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="flex items-center gap-3 rounded-2xl border border-amber/40 bg-amber/10 px-4 py-3 text-left transition-colors hover:border-amber/70"
      title="Copiar código"
    >
      <div>
        <p className="label text-amber/80">Código de la sala · compártelo para que se unan</p>
        <p className="font-display text-2xl font-semibold tracking-[0.3em] text-amber">{codigo}</p>
      </div>
      <span className="ml-auto text-xs font-medium text-amber/80">{copiado ? '¡Copiado!' : 'Copiar ⧉'}</span>
    </motion.button>
  );
}
