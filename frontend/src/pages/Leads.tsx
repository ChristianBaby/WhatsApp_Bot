import { useEffect, useState } from 'react';
import { EncabezadoPagina } from '../components/ui/EncabezadoPagina';
import { EstadoVacio } from '../components/ui/EstadoVacio';
import { Tarjeta } from '../components/ui/Tarjeta';
import { api, ErrorApi } from '../lib/api';
import type { ListaLeads, PrevisualizacionLista } from '../lib/types';
import { Dropzone } from './leads/Dropzone';
import { PrevisualizacionCarga } from './leads/PrevisualizacionCarga';
import { TablaListas } from './leads/TablaListas';

export function Leads() {
  const [listas, setListas] = useState<ListaLeads[] | null>(null);
  const [previsualizacion, setPrevisualizacion] = useState<PrevisualizacionLista | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ListaLeads[]>('/listas-leads')
      .then(setListas)
      .catch(() => setListas([]));
  }, []);

  async function alSubirArchivo(archivo: File) {
    setError(null);
    setAnalizando(true);
    try {
      const formData = new FormData();
      formData.append('archivo', archivo);
      const resultado = await api.post<PrevisualizacionLista>('/listas-leads/previsualizar', formData);
      setPrevisualizacion(resultado);
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo leer el archivo. Intenta de nuevo.');
    } finally {
      setAnalizando(false);
    }
  }

  async function alConfirmar(nombre: string) {
    if (!previsualizacion) return;
    setGuardando(true);
    setError(null);
    try {
      const lista = await api.post<ListaLeads>('/listas-leads', {
        nombre,
        nombreArchivoOriginal: previsualizacion.nombreArchivoOriginal,
        columnasExtra: previsualizacion.columnasExtra,
        filasValidas: previsualizacion.filasValidas,
        filasInvalidas: previsualizacion.filasInvalidas,
      });
      setListas((prev) => [lista, ...(prev ?? [])]);
      setPrevisualizacion(null);
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo guardar la lista. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <EncabezadoPagina titulo="Leads" descripcion="Sube y administra tus listas de contactos." />

      {previsualizacion ? (
        <Tarjeta>
          <PrevisualizacionCarga
            previsualizacion={previsualizacion}
            guardando={guardando}
            onConfirmar={(nombre) => void alConfirmar(nombre)}
            onCancelar={() => {
              setPrevisualizacion(null);
              setError(null);
            }}
          />
        </Tarjeta>
      ) : (
        <Dropzone onArchivo={(a) => void alSubirArchivo(a)} disabled={analizando} />
      )}

      {analizando && <p style={{ color: 'var(--texto-suave)', fontSize: 13 }}>Leyendo el archivo…</p>}
      {error && <p style={{ color: 'var(--peligro)', fontSize: 13 }}>{error}</p>}

      {!previsualizacion && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 10 }}>Listas cargadas</div>

          {listas === null && (
            <Tarjeta>
              <EstadoVacio titulo="Cargando…" />
            </Tarjeta>
          )}

          {listas !== null && listas.length === 0 && (
            <Tarjeta>
              <EstadoVacio
                titulo="Todavía no hay listas cargadas"
                detalle="Sube un CSV o Excel con al menos las columnas de teléfono y empresa."
              />
            </Tarjeta>
          )}

          {listas !== null && listas.length > 0 && (
            <Tarjeta sinPadding>
              <TablaListas listas={listas} />
            </Tarjeta>
          )}
        </div>
      )}
    </div>
  );
}
