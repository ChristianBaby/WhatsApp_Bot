import { useEffect, useState } from 'react';
import { EncabezadoPagina } from '../components/ui/EncabezadoPagina';
import { EstadoVacio } from '../components/ui/EstadoVacio';
import { Tarjeta } from '../components/ui/Tarjeta';
import { Segmentado } from '../components/ui/Segmentado';
import { api, ErrorApi } from '../lib/api';
import type { ListaLeads, PrevisualizacionLista } from '../lib/types';
import { Dropzone } from './leads/Dropzone';
import { NoContactar } from './leads/NoContactar';
import { PrevisualizacionCarga } from './leads/PrevisualizacionCarga';
import { TablaListas } from './leads/TablaListas';
import estilos from './leads/Leads.module.css';

type Pestana = 'listas' | 'no_contactar';

export function Leads() {
  const [pestana, setPestana] = useState<Pestana>('listas');
  const [listas, setListas] = useState<ListaLeads[] | null>(null);
  const [previsualizacion, setPrevisualizacion] = useState<PrevisualizacionLista | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  function cargarListas() {
    api
      .get<ListaLeads[]>('/listas-leads')
      .then(setListas)
      .catch(() => setListas([]));
  }

  useEffect(cargarListas, []);

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

  async function alConfirmar(nombre: string, nichoId: number | null) {
    if (!previsualizacion) return;
    setGuardando(true);
    setError(null);
    try {
      const lista = await api.post<ListaLeads>('/listas-leads', {
        nombre,
        nombreArchivoOriginal: previsualizacion.nombreArchivoOriginal,
        archivoToken: previsualizacion.archivoToken,
        nichoId,
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

  function alEliminarLista(id: number, accion: 'eliminada' | 'archivada') {
    setListas((prev) => (prev ?? []).filter((l) => l.id !== id));
    setAviso(
      accion === 'eliminada'
        ? 'Lista eliminada.'
        : 'Lista archivada: ya se había usado en campañas, así que sus campañas y métricas se conservan.',
    );
    setTimeout(() => setAviso(null), 5000);
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Leads"
        descripcion="Sube y administra tus listas de contactos."
        acciones={
          <Segmentado<Pestana>
            etiqueta="Vista de leads"
            valor={pestana}
            onCambio={setPestana}
            opciones={[
              { valor: 'listas', etiqueta: 'Listas', contador: listas?.length },
              { valor: 'no_contactar', etiqueta: 'No contactar' },
            ]}
          />
        }
      />

      {pestana === 'no_contactar' ? (
        <NoContactar />
      ) : (
        <>
          {previsualizacion ? (
            <Tarjeta>
              <PrevisualizacionCarga
                previsualizacion={previsualizacion}
                guardando={guardando}
                onConfirmar={(nombre, nichoId) => void alConfirmar(nombre, nichoId)}
                onCancelar={() => {
                  setPrevisualizacion(null);
                  setError(null);
                }}
              />
            </Tarjeta>
          ) : (
            <Dropzone onArchivo={(a) => void alSubirArchivo(a)} disabled={analizando} />
          )}

          {analizando && <p className={estilos.aviso}>Leyendo el archivo…</p>}
          {error && <p className={`${estilos.aviso} ${estilos.avisoError}`}>{error}</p>}
          {aviso && <p className={`${estilos.aviso} ${estilos.avisoExito}`}>{aviso}</p>}

          {!previsualizacion && (
            <div style={{ marginTop: 24 }}>
              <div className={estilos.tituloSeccion}>
                Listas cargadas
                {listas && listas.length > 0 && (
                  <span className={estilos.resumenSeccion}>
                    {listas.length} {listas.length === 1 ? 'lista' : 'listas'} ·{' '}
                    {listas.reduce((t, l) => t + l.validas, 0).toLocaleString('es-PE')} contactos válidos
                  </span>
                )}
              </div>

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
                  <TablaListas listas={listas} onEliminada={alEliminarLista} onCambio={cargarListas} />
                </Tarjeta>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
