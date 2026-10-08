import { useCallback, useEffect, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Boton } from '../../components/ui/Boton';
import { api, ErrorApi } from '../../lib/api';
import { formatearFecha } from '../../lib/fecha';
import type { LeadGestion, ListaLeads, PaginaLeads } from '../../lib/types';
import estilos from './LeadsDeLista.module.css';

const TAMANO_PAGINA = 25;

const ETIQUETA_ETAPA: Record<string, string> = {
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  respondio: 'Respondió',
  en_conversacion: 'En conversación',
  interesado: 'Interesado',
  no_interesado: 'No interesado',
  duda_precio: 'Duda de precio',
  venta_concretada: 'Cliente',
  descartado: 'Descartado',
};

type Borrador = { telefono: string; empresa: string; rubro: string };
const VACIO: Borrador = { telefono: '', empresa: '', rubro: '' };

function mensajeError(err: unknown, porDefecto: string): string {
  return err instanceof ErrorApi ? err.message : porDefecto;
}

/** Ver, buscar, agregar, editar y eliminar los leads de una lista. */
export function LeadsDeLista({ lista, onCambio }: { lista: ListaLeads; onCambio: () => void }) {
  const [buscar, setBuscar] = useState('');
  const [busquedaAplicada, setBusquedaAplicada] = useState('');
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState<PaginaLeads | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [nuevo, setNuevo] = useState<Borrador>(VACIO);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [edicion, setEdicion] = useState<Borrador>(VACIO);
  const [procesando, setProcesando] = useState(false);

  const cargar = useCallback(async () => {
    const parametros = new URLSearchParams({ pagina: String(pagina), tamano: String(TAMANO_PAGINA) });
    if (busquedaAplicada) parametros.set('buscar', busquedaAplicada);
    try {
      setDatos(await api.get<PaginaLeads>(`/listas-leads/${lista.id}/leads?${parametros.toString()}`));
    } catch (err) {
      setError(mensajeError(err, 'No se pudieron cargar los leads'));
    }
  }, [lista.id, pagina, busquedaAplicada]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Busca al dejar de escribir (no en cada tecla).
  useEffect(() => {
    const t = setTimeout(() => {
      setPagina(1);
      setBusquedaAplicada(buscar.trim());
    }, 350);
    return () => clearTimeout(t);
  }, [buscar]);

  async function ejecutar(accion: () => Promise<unknown>, porDefecto: string): Promise<boolean> {
    setProcesando(true);
    setError(null);
    try {
      await accion();
      await cargar();
      onCambio();
      return true;
    } catch (err) {
      setError(mensajeError(err, porDefecto));
      return false;
    } finally {
      setProcesando(false);
    }
  }

  async function guardarNuevo() {
    const ok = await ejecutar(
      () => api.post(`/listas-leads/${lista.id}/leads`, { ...nuevo, rubro: nuevo.rubro || null }),
      'No se pudo agregar el lead',
    );
    if (ok) {
      setNuevo(VACIO);
      setAgregando(false);
    }
  }

  function empezarEdicion(lead: LeadGestion) {
    setEditandoId(lead.id);
    setEdicion({ telefono: `+${lead.telefono}`, empresa: lead.empresa, rubro: lead.rubro ?? '' });
  }

  async function guardarEdicion(id: number) {
    const ok = await ejecutar(
      () => api.patch(`/leads/${id}`, { ...edicion, rubro: edicion.rubro || null }),
      'No se pudo guardar el lead',
    );
    if (ok) setEditandoId(null);
  }

  async function eliminar(lead: LeadGestion) {
    if (!window.confirm(`¿Eliminar a "${lead.empresa}" de esta lista?`)) return;
    await ejecutar(() => api.delete(`/leads/${lead.id}`), 'No se pudo eliminar el lead');
  }

  const totalPaginas = datos ? Math.max(1, Math.ceil(datos.total / TAMANO_PAGINA)) : 1;

  return (
    <div className={estilos.panel}>
      <div className={estilos.barra}>
        <input
          className={estilos.input}
          placeholder="Buscar por empresa, teléfono o rubro…"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
        />
        <Boton variante="secundario" onClick={() => setAgregando((v) => !v)} disabled={procesando}>
          {agregando ? 'Cancelar' : '+ Agregar lead'}
        </Boton>
      </div>

      {agregando && (
        <div className={estilos.formulario}>
          <input
            className={estilos.input}
            placeholder="Teléfono (ej. 987 654 321)"
            value={nuevo.telefono}
            onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })}
          />
          <input
            className={estilos.input}
            placeholder="Empresa"
            value={nuevo.empresa}
            onChange={(e) => setNuevo({ ...nuevo, empresa: e.target.value })}
          />
          <input
            className={estilos.input}
            placeholder="Rubro (opcional)"
            value={nuevo.rubro}
            onChange={(e) => setNuevo({ ...nuevo, rubro: e.target.value })}
          />
          <Boton
            onClick={() => void guardarNuevo()}
            disabled={procesando || !nuevo.telefono.trim() || !nuevo.empresa.trim()}
          >
            Guardar
          </Boton>
        </div>
      )}

      {error && <div className={estilos.error}>{error}</div>}

      {!datos ? (
        <div className={estilos.vacio}>Cargando…</div>
      ) : datos.leads.length === 0 ? (
        <div className={estilos.vacio}>{busquedaAplicada ? 'Ningún lead coincide con la búsqueda.' : 'Esta lista no tiene leads.'}</div>
      ) : (
        <>
          <div className={estilos.encabezado}>
            <div>Empresa</div>
            <div>Teléfono</div>
            <div>Rubro</div>
            <div>Etapa</div>
            <div>Último envío</div>
            <div />
          </div>
          {datos.leads.map((lead) =>
            editandoId === lead.id ? (
              <div className={estilos.fila} key={lead.id}>
                <input
                  className={estilos.input}
                  value={edicion.empresa}
                  onChange={(e) => setEdicion({ ...edicion, empresa: e.target.value })}
                />
                <input
                  className={estilos.input}
                  value={edicion.telefono}
                  onChange={(e) => setEdicion({ ...edicion, telefono: e.target.value })}
                />
                <input
                  className={estilos.input}
                  value={edicion.rubro}
                  onChange={(e) => setEdicion({ ...edicion, rubro: e.target.value })}
                />
                <div />
                <div />
                <div className={estilos.acciones}>
                  <Boton onClick={() => void guardarEdicion(lead.id)} disabled={procesando}>
                    Guardar
                  </Boton>
                  <Boton variante="texto" onClick={() => setEditandoId(null)} disabled={procesando}>
                    Cancelar
                  </Boton>
                </div>
              </div>
            ) : (
              <div className={estilos.fila} key={lead.id}>
                <div className={estilos.empresa}>{lead.empresa}</div>
                <div>+{lead.telefono}</div>
                <div className={estilos.suave}>{lead.rubro ?? '—'}</div>
                <div className={estilos.etapa}>
                  <Badge tono="neutro">{ETIQUETA_ETAPA[lead.etapaPipeline] ?? lead.etapaPipeline}</Badge>
                  {lead.bloqueado && <Badge tono="peligro">No contactar</Badge>}
                </div>
                <div className={estilos.suave}>{lead.ultimoEnvioEn ? formatearFecha(lead.ultimoEnvioEn) : '—'}</div>
                <div className={estilos.acciones}>
                  <Boton variante="texto" onClick={() => empezarEdicion(lead)} disabled={procesando}>
                    Editar
                  </Boton>
                  <Boton
                    variante="texto"
                    onClick={() => void eliminar(lead)}
                    disabled={procesando || lead.tieneHistorial}
                    title={
                      lead.tieneHistorial
                        ? 'Ya recibió campañas: no se puede borrar sin perder sus métricas. Usa "No contactar".'
                        : undefined
                    }
                  >
                    Eliminar
                  </Boton>
                </div>
              </div>
            ),
          )}

          {totalPaginas > 1 && (
            <div className={estilos.paginacion}>
              <Boton variante="secundario" onClick={() => setPagina((p) => p - 1)} disabled={pagina <= 1}>
                ← Anterior
              </Boton>
              <span>
                Página {pagina} de {totalPaginas} · {datos.total} leads
              </span>
              <Boton variante="secundario" onClick={() => setPagina((p) => p + 1)} disabled={pagina >= totalPaginas}>
                Siguiente →
              </Boton>
            </div>
          )}
        </>
      )}
    </div>
  );
}
