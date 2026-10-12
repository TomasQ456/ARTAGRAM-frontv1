import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FondoArtistico } from '../../components/layout/FondoArtistico';

export function LandingPage() {
  return (
    <FondoArtistico>
      <div className="relative overflow-hidden">
        <section className="relative mx-auto flex max-w-6xl flex-col items-center px-4 pb-20 pt-20 text-center sm:pt-28">
          <div className="rounded-[2.5rem] bg-paper/50 px-6 py-10 backdrop-blur-[3px] sm:px-16 sm:py-14">
            <motion.span
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="chip mb-6 border-violet/40 bg-paper/80 text-violet-dark"
            >
              El proceso importa tanto como la obra
            </motion.span>
            <motion.h1
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="max-w-3xl font-display text-4xl font-semibold leading-tight text-ink-950 sm:text-6xl"
            >
              Dibuja <span className="text-coral-dark">junto a otros</span>, en el mismo lienzo, al mismo tiempo
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mx-auto mt-6 max-w-xl text-lg text-ink-950/75"
            >
              Publica tu obra con su proceso, únete a comunidades con lienzos compartidos y entra al modo fiesta:
              rondas cronometradas donde todos pintan con el mismo pincel.
            </motion.p>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mt-9 flex flex-wrap items-center justify-center gap-3"
          >
            <Link to="/registro" className="btn-primary px-6 py-3 text-base">
              Empezar a dibujar
            </Link>
            <Link to="/login" className="btn-secondary px-6 py-3 text-base !bg-paper/80 !text-ink-950 !border-ink-950/15 hover:!text-violet-dark">
              Ya tengo cuenta
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.6 }}
            className="card-light relative mt-16 w-full max-w-4xl overflow-hidden p-2"
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <VistaLienzo color="#FF6B57" nombre="lienzo_azul" />
              <VistaLienzo color="#2FD9C4" nombre="acuarela_urbana" />
              <VistaLienzo color="#8B5CF6" nombre="pixel_studio" />
            </div>
          </motion.div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-4 pb-24 sm:grid-cols-3">
          {[
            {
              titulo: 'Comunidades con lienzo compartido',
              texto: 'Varios artistas pintando la misma obra en tiempo real, con pinceles con textura de verdad.',
              color: 'text-coral-dark',
            },
            {
              titulo: 'Modo fiesta',
              texto: 'Rondas cronometradas por el servidor, sin borrar ni deshacer, y un borrador que se disputa entre todos.',
              color: 'text-violet-dark',
            },
            {
              titulo: 'El proceso, no solo el resultado',
              texto: 'Publica tu obra final junto con cómo la fuiste armando, paso a paso.',
              color: 'text-teal-dark',
            },
          ].map((f) => (
            <div key={f.titulo} className="card-light p-6">
              <h3 className={`font-display text-lg font-semibold ${f.color}`}>{f.titulo}</h3>
              <p className="mt-2 text-sm text-ink-950/70">{f.texto}</p>
            </div>
          ))}
        </section>
      </div>
    </FondoArtistico>
  );
}

function VistaLienzo({ color, nombre }: { color: string; nombre: string }) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-ink-950">
      <svg viewBox="0 0 200 150" className="h-full w-full">
        <path d="M10 120 Q 50 20, 100 80 T 190 40" stroke={color} strokeWidth="6" fill="none" strokeLinecap="round" opacity="0.9" />
        <circle cx="60" cy="60" r="22" fill={color} opacity="0.25" />
      </svg>
      <span className="absolute bottom-2 left-2 rounded-full bg-ink-900/80 px-2 py-0.5 text-[10px] text-paper-muted">
        {nombre}
      </span>
    </div>
  );
}
