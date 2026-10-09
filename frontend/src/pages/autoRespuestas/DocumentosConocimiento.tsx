import { useEffect, useRef, useState } from 'react';
import { Boton } from '../../components/ui/Boton';
import { Interruptor } from '../../components/ui/Interruptor';
import { Modal } from '../../components/ui/Modal';
import { api, ErrorApi } from '../../lib/api';
import { formatearFecha } from '../../lib/fecha';
import estilos from './DocumentosConocimiento.module.css';

export type DocumentoConocimiento = {
  id: number;
  nombre: string;
  contenido: string;
  activo: boolean;
  caracteres: number;
  actualizadoEn: string;
};

type Edicion = { id: number | null; nombre: string; contenido: string };

function mensajeError(err: unknown, porDefecto: string): string {
  return err instanceof ErrorApi ? err.message : porDefecto;
}

/**
 * Documentos (.md) de los que la IA saca sus respuestas: servicios, precios,
 * preguntas frecuentes... Se guardan al instante (no dependen de "Guardar cambios").
 */
export function DocumentosConocimiento({ iaDisponible }: { iaDisponible: boolean | null }) {
  const [documentos, setDocumentos] = useState<DocumentoConocimiento[] | null>(null);
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  async function cargar() {
    const datos = await api.get<{ documentos: DocumentoConocimiento[] }>('/conocimiento');
    setDocumentos(datos.documentos);
  }

  useEffect(() => {
    void cargar().catch(() => setDocumentos([]));
  }, []);

  async function ejecutar(accion: () => Promise<unknown>, porDefecto: string): Promise<boolean> {
    setProcesando(true);
    setError(null);
    try {
      await accion();
      await cargar();
      return true;
    } catch (err) {
      setError(mensajeError(err, porDefecto));
      return false;
    } finally {
      setProcesando(false);
    }
  }

  function subir(archivos: FileList | null) {
    if (!archivos || archivos.length === 0) return;
    const datos = new FormData();
    for (const archivo of Array.from(archivos)) datos.append('archivos', archivo);
    void ejecutar(() => api.post('/conocimiento/archivos', datos), 'No se pudieron subir los documentos').finally(() => {
      if (entrada.current) entrada.current.value = '';
    });
  }

  async function guardarEdicion() {
    if (!edicion) return;
    const cuerpo = { nombre: edicion.nombre, contenido: edicion.contenido };
    const ok = await ejecutar(
      () => (edicion.id ? api.patch(`/conocimiento/${edicion.id}`, cuerpo) : api.post('/conocimiento', cuerpo)),
      'No se pudo guardar el documento',
    );
    if (ok) setEdicion(null);
  }

  function eliminar(doc: DocumentoConocimiento) {
    if (!window.confirm(`¿Eliminar "${doc.nombre}"? La IA dejará de usar esa información.`)) return;
    void ejecutar(() => api.delete(`/conocimiento/${doc.id}`), 'No se pudo eliminar el documento');
  }

  const totalActivo = (documentos ?? []).filter((d) => d.activo).reduce((s, d) => s + d.caracteres, 0);

  return (
    <div>
      {iaDisponible === false && (
        <div className={estilos.aviso}>
          La IA no está configurada en el servidor (falta GEMINI_API_KEY): el bot solo enviará la bienvenida fija y
          pasará el resto a un asesor.
        </div>
      )}

      <div className={estilos.barra}>
        <Boton variante="secundario" onClick={() => entrada.current?.click()} disabled={procesando}>
          ⬆ Subir archivos .md
        </Boton>
        <Boton variante="texto" onClick={() => setEdicion({ id: null, nombre: '', contenido: '' })} disabled={procesando}>
          + Escribir documento
        </Boton>
        <input
          ref={entrada}
          type="file"
          accept=".md,.markdown,.txt"
          multiple
          hidden
          onChange={(e) => subir(e.target.files)}
        />
      </div>

      {error && <div className={estilos.error}>{error}</div>}

      {documentos === null && <div className={estilos.vacio}>Cargando…</div>}
      {documentos !== null && documentos.length === 0 && (
        <div className={estilos.vacio}>
          Todavía no hay documentos. Sube uno o más .md con tus servicios, precios, horarios y preguntas frecuentes:
          usa títulos (# Servicios, ## Precios…) para que la IA encuentre rápido cada tema.
        </div>
      )}

      {documentos?.map((doc) => (
        <div className={estilos.fila} key={doc.id}>
          <div className={estilos.info}>
            <div className={estilos.nombre}>{doc.nombre}</div>
            <div className={estilos.detalle}>
              {doc.caracteres.toLocaleString('es-PE')} caracteres · actualizado {formatearFecha(doc.actualizadoEn)}
            </div>
          </div>
          <Interruptor
            activo={doc.activo}
            onCambio={(activo) =>
              void ejecutar(() => api.patch(`/conocimiento/${doc.id}`, { activo }), 'No se pudo cambiar el documento')
            }
            disabled={procesando}
            etiqueta={`Usar "${doc.nombre}"`}
          />
          <Boton
            variante="texto"
            onClick={() => setEdicion({ id: doc.id, nombre: doc.nombre, contenido: doc.contenido })}
            disabled={procesando}
          >
            Ver / editar
          </Boton>
          <Boton variante="texto" onClick={() => eliminar(doc)} disabled={procesando}>
            Eliminar
          </Boton>
        </div>
      ))}

      {documentos !== null && documentos.length > 0 && (
        <div className={estilos.detalle} style={{ marginTop: 8 }}>
          La IA usa {totalActivo.toLocaleString('es-PE')} caracteres de documentos activos.
          {totalActivo > 60_000 && ' Como superan 60 000, en cada respuesta elige solo las secciones relacionadas con la pregunta.'}
        </div>
      )}

      {edicion && (
        <Modal titulo={edicion.id ? 'Editar documento' : 'Nuevo documento'} onCerrar={() => setEdicion(null)} ancho>
          <input
            className={estilos.input}
            placeholder="Nombre (ej. precios.md)"
            value={edicion.nombre}
            onChange={(e) => setEdicion({ ...edicion, nombre: e.target.value })}
          />
          <textarea
            className={estilos.editor}
            rows={18}
            value={edicion.contenido}
            onChange={(e) => setEdicion({ ...edicion, contenido: e.target.value })}
            placeholder={'# Servicios\nTours a Machu Picchu...\n\n## Precios\n- Tour clásico: S/ 350 por persona\n\n# Preguntas frecuentes\n## ¿Incluye transporte?\nSí, desde el hotel.'}
          />
          {error && <div className={estilos.error}>{error}</div>}
          <div className={estilos.barra} style={{ justifyContent: 'flex-end', marginTop: 10 }}>
            <Boton variante="texto" onClick={() => setEdicion(null)} disabled={procesando}>
              Cancelar
            </Boton>
            <Boton
              onClick={() => void guardarEdicion()}
              disabled={procesando || !edicion.nombre.trim() || !edicion.contenido.trim()}
            >
              Guardar documento
            </Boton>
          </div>
        </Modal>
      )}
    </div>
  );
}
