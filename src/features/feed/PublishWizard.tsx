import { useState } from 'react';
import { motion } from 'framer-motion';
import { api, extraerMensajeError } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import type { PublicacionDto } from '../../types';

export function PublishWizard({ onPublicado, onCerrar }: { onPublicado: (p: PublicacionDto) => void; onCerrar: () => void }) {
  const [paso, setPaso] = useState<1 | 2>(1);
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [etiquetasTexto, setEtiquetasTexto] = useState('');
  const [obraFinal, setObraFinal] = useState<File | null>(null);
  const [previewObra, setPreviewObra] = useState<string | null>(null);
  const [imagenesProceso, setImagenesProceso] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function elegirObraFinal(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0] ?? null;
    setObraFinal(archivo);
    setPreviewObra(archivo ? URL.createObjectURL(archivo) : null);
  }

  function elegirProceso(e: React.ChangeEvent<HTMLInputElement>) {
    const archivos = Array.from(e.target.files ?? []).slice(0, 10);
    setImagenesProceso(archivos);
  }

  async function publicar() {
    if (!titulo.trim() || !obraFinal) {
      setError('Necesitas al menos un título y la imagen final');
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      const form = new FormData();
      form.append('titulo', titulo.trim());
      if (descripcion.trim()) form.append('descripcion', descripcion.trim());
      etiquetasTexto
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .forEach((t) => form.append('etiquetas', t));
      form.append('obraFinal', obraFinal);
      imagenesProceso.forEach((f) => form.append('imagenesProceso', f));

      const { data } = await api.post<PublicacionDto>('/api/publicaciones', form);
      onPublicado(data);
    } catch (err) {
      setError(extraerMensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="card mb-8 overflow-hidden p-6"
    >
      <div className="mb-5 flex items-center gap-2">
        <StepDot activo={paso === 1} numero={1} etiqueta="La obra" />
        <div className="h-px flex-1 bg-ink-700" />
        <StepDot activo={paso === 2} numero={2} etiqueta="El proceso" />
      </div>

      {paso === 1 && (
        <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
          <div className="flex flex-col gap-4">
            <TextField label="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Jardines al amanecer" required />
            <TextField
              label="Descripción (opcional)"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Acuarela sobre papel, 30x40cm…"
            />
            <TextField
              label="Etiquetas separadas por coma"
              value={etiquetasTexto}
              onChange={(e) => setEtiquetasTexto(e.target.value)}
              placeholder="acuarela, paisaje, jardines"
            />
          </div>
          <div>
            <p className="label mb-2">Imagen final</p>
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-600 text-center text-xs text-paper-dim hover:border-coral/50">
              {previewObra ? (
                <img src={previewObra} alt="Vista previa" className="h-full w-full rounded-xl object-cover" />
              ) : (
                <>
                  <span className="text-2xl">🖼️</span>
                  Subir imagen
                </>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={elegirObraFinal} />
            </label>
          </div>
        </div>
      )}

      {paso === 2 && (
        <div>
          <p className="label mb-2">Fotos del proceso (opcional, hasta 10)</p>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-ink-600 px-4 py-8 text-center text-sm text-paper-dim hover:border-violet/50">
            <span className="text-2xl">📸</span>
            Arrastra o elige varias imágenes que muestren cómo la fuiste haciendo
            <input type="file" accept="image/*" multiple className="hidden" onChange={elegirProceso} />
          </label>
          {imagenesProceso.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {imagenesProceso.map((f, i) => (
                <span key={i} className="chip text-xs">
                  {f.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-4 rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral-light">{error}</p>}

      <div className="mt-6 flex justify-between">
        <Button variant="ghost" onClick={onCerrar}>
          Cancelar
        </Button>
        <div className="flex gap-2">
          {paso === 2 && (
            <Button variant="secondary" onClick={() => setPaso(1)}>
              Atrás
            </Button>
          )}
          {paso === 1 ? (
            <Button onClick={() => (titulo.trim() && obraFinal ? setPaso(2) : setError('Necesitas al menos un título y la imagen final'))}>
              Siguiente
            </Button>
          ) : (
            <Button onClick={publicar} cargando={enviando}>
              Publicar
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function StepDot({ activo, numero, etiqueta }: { activo: boolean; numero: number; etiqueta: string }) {
  return (
    <div className={`flex items-center gap-2 text-sm ${activo ? 'text-coral' : 'text-paper-dim'}`}>
      <span
        className={`grid h-6 w-6 place-items-center rounded-full border text-xs font-semibold ${
          activo ? 'border-coral bg-coral/15' : 'border-ink-600'
        }`}
      >
        {numero}
      </span>
      {etiqueta}
    </div>
  );
}
