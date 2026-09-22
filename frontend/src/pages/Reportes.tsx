import { useEffect, useMemo, useState } from 'react';
import { EncabezadoPagina } from '../components/ui/EncabezadoPagina';
import { EstadoVacio } from '../components/ui/EstadoVacio';
import { Tarjeta } from '../components/ui/Tarjeta';
import { Boton } from '../components/ui/Boton';
import { api } from '../lib/api';
import { formatearFecha } from '../lib/fecha';
import type { DatosReportes } from '../lib/types';
import estilos from './Reportes.module.css';

type Periodo = 'ultimos30' | 'estemes' | 'todo';

const COLOR_ETAPA: Record<string, string> = {
  Nuevo: 'var(--embudo-nuevo)',
  Contactado: 'var(--embudo-contactado)',
  Respondió: 'var(--acento)',
  Interesado: 'var(--exito)',
  'Venta concretada': 'var(--exito-fuerte)',
};

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

  function urlExportar(): string {
    const { desde, hasta } = rangoDe(periodo);
    const parametros = new URLSearchParams();
    if (desde) parametros.set('desde', desde);
    if (hasta) parametros.set('hasta', hasta);
    if (rubro) parametros.set('rubro', rubro);
    return `/api/reportes/exportar?${parametros.toString()}`;
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
            <a href={urlExportar()}>
              <Boton variante="secundario">⬇ Exportar Excel</Boton>
            </a>
          </div>
        }
      />

      {!datos ? (
        <Tarjeta>
          <EstadoVacio titulo="Cargando…" />
        </Tarjeta>
      ) : (
        <>
          <div className={estilos.tarjetasKpi}>
            <div className={estilos.kpi}>
              <div className={estilos.kpiLabel}>Mensajes enviados</div>
              <div className={estilos.kpiValor}>{datos.kpis.mensajesEnviados}</div>
            </div>
            <div className={estilos.kpi}>
              <div className={estilos.kpiLabel}>Tasa de respuesta</div>
              <div className={estilos.kpiValor}>{datos.kpis.tasaRespuesta}%</div>
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

          <div className={estilos.filaDos}>
            <Tarjeta>
              <div className={estilos.tituloPanel}>Embudo del pipeline</div>
              {datos.embudo.every((e) => e.valor === 0) ? (
                <EstadoVacio titulo="Todavía no hay leads" detalle="Sube tu primera lista para ver el embudo." />
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
                  titulo="Todavía no hay campañas completadas"
                  detalle="Cuando termine una publicación, aparecerá aquí con su resultado."
                />
              </div>
            ) : (
              <>
                <div className={estilos.tablaEncabezado}>
                  <div>Campaña</div>
                  <div>Fecha</div>
                  <div>Enviados</div>
                  <div>Sin WhatsApp</div>
                  <div>Fallidos</div>
                  <div>Tasa resp.</div>
                  <div />
                </div>
                {datos.campanas.map((c) => (
                  <div className={estilos.tablaFila} key={c.id}>
                    <div className={estilos.nombreCampana}>{c.nombre}</div>
                    <div>{c.fecha ? formatearFecha(c.fecha) : '—'}</div>
                    <div>{c.enviados}</div>
                    <div>{c.sinWhatsapp}</div>
                    <div>{c.fallidos}</div>
                    <div>{c.tasaRespuesta}%</div>
                    <div>
                      <a href={`/api/reportes/campanas/${c.id}/log`}>
                        <Boton variante="secundario">Descargar log</Boton>
                      </a>
                    </div>
                  </div>
                ))}
              </>
            )}
          </Tarjeta>
        </>
      )}
    </div>
  );
}
