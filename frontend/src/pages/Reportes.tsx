import { useEffect, useMemo, useState } from 'react';
import { EncabezadoPagina } from '../components/ui/EncabezadoPagina';
import { EstadoVacio } from '../components/ui/EstadoVacio';
import { Tarjeta } from '../components/ui/Tarjeta';
import { Boton } from '../components/ui/Boton';
import { api } from '../lib/api';
import { formatearFecha } from '../lib/fecha';
import type { CampanaResumen, DatosReportes } from '../lib/types';
import { ModalDetalleCampana } from './reportes/ModalDetalleCampana';
import estilos from './Reportes.module.css';

type Periodo = 'ultimos30' | 'estemes' | 'todo';

const COLOR_ETAPA: Record<string, string> = {
  Contactados: 'var(--embudo-nuevo)',
  Leyeron: 'var(--embudo-contactado)',
  Respondieron: 'var(--acento)',
  Interesados: 'var(--exito)',
  'Venta concretada': 'var(--exito-fuerte)',
};

const ETIQUETA_ESTADO: Record<string, string> = {
  en_curso: 'En curso',
  pausada: 'Pausada',
  programada: 'Programada',
  completada: 'Completada',
  cancelada: 'Cancelada',
};

/** 75 -> "1 h 15 min"; null -> "—" */
function formatearMinutos(minutos: number | null): string {
  if (minutos === null) return '—';
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 48) return `${horas} h ${minutos % 60} min`;
  return `${Math.round(horas / 24)} días`;
}

function rangoDe(periodo: Periodo): { desde: string | null; hasta: string | null } {
  const ahora = new Date();
  if (periodo === 'todo') return { desde: null, hasta: null };
  if (periodo === 'estemes') {
    const inicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    return { desde: inicio.toISOString(), hasta: null };
  }
  const hace30 = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { desde: hace30.toISOString(), hasta: null };
}

export function Reportes() {
  const [periodo, setPeriodo] = useState<Periodo>('ultimos30');
  const [rubro, setRubro] = useState('');
  const [datos, setDatos] = useState<DatosReportes | null>(null);
  const [rubrosDisponibles, setRubrosDisponibles] = useState<string[]>([]);
  const [detalle, setDetalle] = useState<CampanaResumen | null>(null);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);

  // Pasa por el Gateway con el token: un <a href="/api/..."> lo rechazaba el backend.
  function descargar(ruta: string) {
    setErrorDescarga(null);
    api.descargar(ruta).catch(() => setErrorDescarga('No se pudo descargar el archivo. Intenta de nuevo.'));
  }

  useEffect(() => {
    const { desde, hasta } = rangoDe(periodo);
    const parametros = new URLSearchParams();
    if (desde) parametros.set('desde', desde);
    if (hasta) parametros.set('hasta', hasta);
    if (rubro) parametros.set('rubro', rubro);

    api.get<DatosReportes>(`/reportes?${parametros.toString()}`).then((resultado) => {
      setDatos(resultado);
      if (!rubro) setRubrosDisponibles(resultado.porRubro.map((r) => r.rubro).filter((r) => r !== 'Sin rubro'));
    });
  }, [periodo, rubro]);

  const maxEmbudo = useMemo(() => datos?.embudo[0]?.valor ?? 0, [datos]);

  function rutaExportar(): string {
    const { desde, hasta } = rangoDe(periodo);
    const parametros = new URLSearchParams();
    if (desde) parametros.set('desde', desde);
    if (hasta) parametros.set('hasta', hasta);
    if (rubro) parametros.set('rubro', rubro);
    return `/reportes/exportar?${parametros.toString()}`;
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Reportes"
        descripcion="Resultados de campañas, del pipeline y del auto-responder."
        acciones={
          <div className={estilos.filtros}>
            <select className={estilos.select} value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)}>
              <option value="ultimos30">Últimos 30 días</option>
              <option value="estemes">Este mes</option>
              <option value="todo">Todo</option>
            </select>
            <select className={estilos.select} value={rubro} onChange={(e) => setRubro(e.target.value)}>
              <option value="">Todos los rubros</option>
              {rubrosDisponibles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <Boton variante="secundario" onClick={() => descargar(rutaExportar())}>
              ⬇ Exportar Excel
            </Boton>
          </div>
        }
      />

      {!datos ? (
        <Tarjeta>
          <EstadoVacio titulo="Cargando…" />
        </Tarjeta>
      ) : (
        <>
          {errorDescarga && <p style={{ color: 'var(--peligro)', fontSize: 13 }}>{errorDescarga}</p>}

          <div className={estilos.tarjetasKpi}>
            <div className={estilos.kpi}>
              <div className={estilos.kpiLabel}>Mensajes enviados</div>
              <div className={estilos.kpiValor}>{datos.kpis.mensajesEnviados}</div>
            </div>
            <div className={estilos.kpi}>
              <div className={estilos.kpiLabel}>Leídos</div>
              <div className={estilos.kpiValor}>
                {datos.kpis.leidos} <span className={estilos.kpiSub}>{datos.kpis.tasaLectura}%</span>
              </div>
            </div>
            <div className={estilos.kpi}>
              <div className={estilos.kpiLabel}>Respondieron</div>
              <div className={estilos.kpiValor}>
                {datos.kpis.respondieron} <span className={estilos.kpiSub}>{datos.kpis.tasaRespuesta}%</span>
              </div>
            </div>
            <div className={estilos.kpi}>
              <div className={estilos.kpiLabel}>Tiempo de respuesta</div>
              <div className={estilos.kpiValor}>{formatearMinutos(datos.kpis.tiempoRespuestaMinutos)}</div>
            </div>
            <div className={estilos.kpi}>
              <div className={estilos.kpiLabel}>Pidieron baja</div>
              <div className={estilos.kpiValor}>{datos.kpis.bajas}</div>
            </div>
            <div className={estilos.kpi}>
              <div className={estilos.kpiLabel}>Entregados</div>
              <div className={estilos.kpiValor}>{datos.kpis.entregados}</div>
            </div>
            <div className={estilos.kpi}>
              <div className={estilos.kpiLabel}>Ventas concretadas</div>
              <div className={estilos.kpiValor}>{datos.kpis.ventasConcretadas}</div>
            </div>
            <div className={estilos.kpi}>
              <div className={estilos.kpiLabel}>Tasa de conversión</div>
              <div className={estilos.kpiValor}>{datos.kpis.tasaConversion}%</div>
            </div>
          </div>
          <div className={estilos.notaKpi}>
            Una respuesta cuenta para la campaña a la que responde (hasta 30 días después del envío). Entregados y leídos
            se registran para los envíos hechos desde esta actualización.
          </div>

          <div className={estilos.filaDos}>
            <Tarjeta>
              <div className={estilos.tituloPanel}>Embudo del pipeline</div>
              {datos.embudo.every((e) => e.valor === 0) ? (
                <EstadoVacio
                  titulo="Sin envíos en este periodo"
                  detalle="El embudo muestra a quienes recibieron una campaña en el periodo elegido."
                />
              ) : (
                datos.embudo.map((e) => (
                  <div className={estilos.embudoFila} key={e.etapa}>
                    <div className={estilos.embudoEncabezado}>
                      <span>{e.etapa}</span>
                      <span className={estilos.embudoValor}>{e.valor}</span>
                    </div>
                    <div className={estilos.embudoBarraFondo}>
                      <div
                        className={estilos.embudoBarraRelleno}
                        style={{
                          width: maxEmbudo > 0 ? `${Math.round((e.valor / maxEmbudo) * 100)}%` : '0%',
                          background: COLOR_ETAPA[e.etapa] ?? 'var(--acento)',
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </Tarjeta>

            <div className={estilos.columnaDerecha}>
              <Tarjeta>
                <div className={estilos.tituloPanel}>Leads por rubro</div>
                {datos.porRubro.length === 0 ? (
                  <EstadoVacio titulo="Sin datos todavía" />
                ) : (
                  datos.porRubro.map((r) => (
                    <div className={estilos.filaRubro} key={r.rubro}>
                      <span className={estilos.rubroNombre}>{r.rubro}</span>
                      <span className={estilos.rubroDetalle}>
                        {r.leads} leads · <span className={estilos.rubroVentas}>{r.ventas} ventas</span>
                      </span>
                    </div>
                  ))
                )}
              </Tarjeta>

              <Tarjeta>
                <div className={estilos.tituloPanel}>Auto-responder</div>
                <div className={estilos.filaAutoResp}>
                  <span>🤖 Atendidas por el bot</span>
                  <span className={estilos.autoRespValor}>{datos.autoResponder.atendidasPorBot}</span>
                </div>
                <div className={estilos.filaAutoResp}>
                  <span>🙋 Escaladas a un asesor</span>
                  <span className={estilos.autoRespValor}>{datos.autoResponder.escaladasAAsesor}</span>
                </div>
                {datos.autoResponder.palabraMasUsada && (
                  <div className={estilos.autoRespNota}>
                    Palabra clave más usada: "{datos.autoResponder.palabraMasUsada.palabra}" (
                    {datos.autoResponder.palabraMasUsada.veces} veces)
                  </div>
                )}
              </Tarjeta>
            </div>
          </div>

          <Tarjeta sinPadding>
            {datos.campanas.length === 0 ? (
              <div style={{ padding: 20 }}>
                <EstadoVacio
                  titulo="Todavía no hay campañas en este periodo"
                  detalle="Cuando arranque una publicación aparecerá aquí con sus resultados en vivo."
                />
              </div>
            ) : (
              <>
                <div className={estilos.tablaEncabezado}>
                  <div>Campaña</div>
                  <div>Fecha</div>
                  <div>Enviados</div>
                  <div>Leídos</div>
                  <div>Respondieron</div>
                  <div>Bajas</div>
                  <div>T. resp.</div>
                  <div />
                </div>
                {datos.campanas.map((c) => (
                  <div className={estilos.tablaFila} key={c.id}>
                    <div className={estilos.nombreCampana}>
                      {c.nombre}
                      <div className={estilos.estadoCampana}>
                        {ETIQUETA_ESTADO[c.estado] ?? c.estado}
                        {c.excluidos > 0 && ` · ${c.excluidos} excluidos`}
                        {c.sinWhatsapp + c.fallidos > 0 && ` · ${c.sinWhatsapp + c.fallidos} sin enviar`}
                      </div>
                    </div>
                    <div>{c.fecha ? formatearFecha(c.fecha) : '—'}</div>
                    <div>{c.enviados}</div>
                    <div>{c.leidos}</div>
                    <div>
                      {c.respondieron} <span className={estilos.kpiSub}>{c.tasaRespuesta}%</span>
                    </div>
                    <div>{c.bajas}</div>
                    <div>{formatearMinutos(c.tiempoRespuestaMinutos)}</div>
                    <div className={estilos.accionesCampana}>
                      <Boton variante="secundario" onClick={() => setDetalle(c)}>
                        Detalle
                      </Boton>
                      <Boton variante="texto" onClick={() => descargar(`/reportes/campanas/${c.id}/log`)}>
                        Log
                      </Boton>
                    </div>
                  </div>
                ))}
              </>
            )}
          </Tarjeta>

          {detalle && <ModalDetalleCampana campana={detalle} onCerrar={() => setDetalle(null)} />}
        </>
      )}
    </div>
  );
}
