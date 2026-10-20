import { useEffect, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Boton } from '../../components/ui/Boton';
import { api, ErrorApi } from '../../lib/api';
import { formatearFechaHora, formatearRelativo } from '../../lib/fecha';
import type { ConversacionDetalle, Etiqueta, NotaInterna, Recordatorio, UsuarioPanel } from '../../lib/types';
import { Avatar } from './Avatar';
import { colorEtiqueta, COLORES_ETIQUETA } from './coloresEtiqueta';
import { infoEtapa } from './etapa';
import { ModalEtiquetas } from './ModalEtiquetas';
import crm from './Crm.module.css';
import org from './Organizar.module.css';

type Props = {
  conversacion: ConversacionDetalle;
  nombre: string;
  /** Cambia cuando alguien toca notas, recordatorios o etiquetas: se vuelven a pedir. */
  version: number;
  onCerrar: () => void;
};

/** Para el campo datetime-local: la hora local, sin zona. */
function aLocal(fecha: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}T${p(fecha.getHours())}:${p(fecha.getMinutes())}`;
}

function aLas(dias: number, hora: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  d.setHours(hora, 0, 0, 0);
  return d;
}

const ATAJOS_RECORDATORIO: { etiqueta: string; fecha: () => Date }[] = [
  { etiqueta: 'En 1 hora', fecha: () => new Date(Date.now() + 3600_000) },
  { etiqueta: 'Mañana 9:00', fecha: () => aLas(1, 9) },
  { etiqueta: 'En 3 días', fecha: () => aLas(3, 9) },
  { etiqueta: 'En 1 semana', fecha: () => aLas(7, 9) },
];

/** La ficha del cliente en el chat: datos, asesor, etiquetas, recordatorios y notas internas. */
export function FichaChat({ conversacion, nombre, version, onCerrar }: Props) {
  const id = conversacion.id;
  const esGrupo = conversacion.esGrupo;
  const [error, setError] = useState<string | null>(null);
  const [datos, setDatos] = useState(conversacion.ficha);
  const [guardadoDatos, setGuardadoDatos] = useState(false);
  const [convirtiendo, setConvirtiendo] = useState(false);
  const [empresaLead, setEmpresaLead] = useState('');
  const [rubroLead, setRubroLead] = useState('');
  const [usuarios, setUsuarios] = useState<UsuarioPanel[]>([]);
  const [yo, setYo] = useState<string | null>(null);
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState('');
  const [gestionando, setGestionando] = useState(false);
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([]);
  const [textoRecordatorio, setTextoRecordatorio] = useState('');
  const [venceRecordatorio, setVenceRecordatorio] = useState(() => aLocal(aLas(1, 9)));
  const [notas, setNotas] = useState<NotaInterna[]>([]);
  const [nota, setNota] = useState('');

  // Al cambiar de chat, los datos editables arrancan de nuevo.
  useEffect(() => {
    setDatos(conversacion.ficha);
    setConvirtiendo(false);
    setError(null);
  }, [id]);

  useEffect(() => {
    void api.get<{ usuarios: UsuarioPanel[]; yo: string | null }>('/usuarios-panel').then((r) => {
      setUsuarios(r.usuarios);
      setYo(r.yo);
    });
  }, []);

  useEffect(() => {
    void api.get<{ etiquetas: Etiqueta[] }>('/etiquetas').then((r) => setEtiquetas(r.etiquetas));
    void api.get<{ recordatorios: Recordatorio[] }>(`/conversaciones/${id}/recordatorios`).then((r) => setRecordatorios(r.recordatorios));
    void api.get<{ notas: NotaInterna[] }>(`/conversaciones/${id}/notas-internas`).then((r) => setNotas(r.notas));
  }, [id, version]);

  async function intentar(accion: () => Promise<unknown>, mensaje: string): Promise<boolean> {
    setError(null);
    try {
      await accion();
      return true;
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : mensaje);
      return false;
    }
  }

  async function guardarDatos() {
    const ok = await intentar(() => api.patch(`/conversaciones/${id}/ficha`, datos), 'No se pudo guardar la ficha');
    if (ok) {
      setGuardadoDatos(true);
      setTimeout(() => setGuardadoDatos(false), 2000);
    }
  }

  async function convertir() {
    const ok = await intentar(
      () => api.post(`/conversaciones/${id}/convertir-lead`, { empresa: empresaLead.trim(), rubro: rubroLead.trim() || null }),
      'No se pudo convertir en lead',
    );
    if (ok) setConvirtiendo(false);
  }

  const puestas = new Set(conversacion.etiquetas.map((e) => e.id));

  async function crearEtiqueta() {
    const nombreEtiqueta = nuevaEtiqueta.trim();
    if (!nombreEtiqueta) return;
    await intentar(async () => {
      const creada = await api.post<Etiqueta>('/etiquetas', { nombre: nombreEtiqueta, color: etiquetas.length % COLORES_ETIQUETA.length });
      await api.post(`/conversaciones/${id}/etiquetas`, { etiquetaId: creada.id, puesta: true });
      setNuevaEtiqueta('');
    }, 'No se pudo crear la etiqueta');
  }

  async function agregarRecordatorio() {
    const texto = textoRecordatorio.trim();
    const vence = new Date(venceRecordatorio);
    if (!texto || Number.isNaN(vence.getTime())) return;
    const ok = await intentar(
      () => api.post(`/conversaciones/${id}/recordatorios`, { texto, venceEn: vence.toISOString() }),
      'No se pudo crear el recordatorio',
    );
    if (ok) setTextoRecordatorio('');
  }

  async function agregarNota() {
    const texto = nota.trim();
    if (!texto) return;
    const ok = await intentar(() => api.post(`/conversaciones/${id}/notas-internas`, { texto }), 'No se pudo guardar la nota');
    if (ok) setNota('');
  }

  const etapa = infoEtapa(conversacion.etapaPipeline);
  const ahora = Date.now();

  return (
    <aside className={org.panelLateral}>
      <div className={org.panelCabecera}>
        <button type="button" className={org.botonIcono} title="Cerrar" onClick={onCerrar}>
          ✕
        </button>
        <span className={org.panelTitulo}>{esGrupo ? 'Ficha del grupo' : 'Ficha del cliente'}</span>
      </div>

      <div className={org.panelCuerpo}>
        <div className={crm.cabeceraFicha}>
          <Avatar conversacionId={id} nombre={nombre} esGrupo={esGrupo} tamano={48} />
          <div>
            <div className={crm.nombreFicha}>{nombre}</div>
            <div className={crm.detalleFicha}>{esGrupo ? 'Grupo de WhatsApp' : `+${conversacion.telefono}`}</div>
          </div>
        </div>

        {error && <div className={crm.error}>{error}</div>}

        {!esGrupo && (
          <section className={crm.seccion}>
            <div className={crm.tituloSeccion}>Datos</div>
            <label className={crm.campo}>
              <span>Nombre</span>
              <input
                className={org.entrada}
                value={datos.nombre ?? ''}
                placeholder={conversacion.nombreAgenda ?? conversacion.nombreContacto ?? 'Cómo se llama'}
                onChange={(e) => setDatos({ ...datos, nombre: e.target.value })}
              />
            </label>
            <label className={crm.campo}>
              <span>Empresa</span>
              <input
                className={org.entrada}
                value={datos.empresa ?? ''}
                placeholder={conversacion.empresa ?? 'Empresa o negocio'}
                onChange={(e) => setDatos({ ...datos, empresa: e.target.value })}
              />
            </label>
            <label className={crm.campo}>
              <span>Correo</span>
              <input
                className={org.entrada}
                type="email"
                value={datos.correo ?? ''}
                placeholder="correo@empresa.com"
                onChange={(e) => setDatos({ ...datos, correo: e.target.value })}
              />
            </label>
            <div className={crm.fila}>
              <Boton onClick={() => void guardarDatos()}>Guardar datos</Boton>
              {guardadoDatos && <span className={crm.ok}>✓ Guardado</span>}
            </div>

            <div className={crm.lead}>
              {conversacion.leadId ? (
                <>
                  <span>Es lead</span>
                  {etapa && <Badge tono={etapa.tono}>{etapa.etiqueta}</Badge>}
                  {conversacion.rubro && <Badge tono="neutro">{conversacion.rubro}</Badge>}
                </>
              ) : convirtiendo ? (
                <div className={crm.formulario}>
                  <input className={org.entrada} placeholder="Empresa (obligatorio)" value={empresaLead} onChange={(e) => setEmpresaLead(e.target.value)} />
                  <input className={org.entrada} placeholder="Rubro (opcional)" value={rubroLead} onChange={(e) => setRubroLead(e.target.value)} />
                  <div className={crm.fila}>
                    <Boton onClick={() => void convertir()} disabled={!empresaLead.trim()}>
                      Convertir en lead
                    </Boton>
                    <Boton variante="secundario" onClick={() => setConvirtiendo(false)}>
                      Cancelar
                    </Boton>
                  </div>
                </div>
              ) : (
                <Boton
                  variante="secundario"
                  onClick={() => {
                    setEmpresaLead(datos.empresa ?? datos.nombre ?? '');
                    setConvirtiendo(true);
                  }}
                >
                  ➕ Convertir en lead
                </Boton>
              )}
            </div>
          </section>
        )}

        <section className={crm.seccion}>
          <div className={crm.tituloSeccion}>Asignado a</div>
          <select
            className={org.entrada}
            value={conversacion.asignadoA?.id ?? ''}
            onChange={(e) =>
              void intentar(() => api.post(`/conversaciones/${id}/asignar`, { usuarioId: e.target.value || null }), 'No se pudo asignar')
            }
          >
            <option value="">Sin asignar</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email ?? u.id}
                {u.id === yo ? ' (tú)' : ''}
              </option>
            ))}
          </select>
        </section>

        <section className={crm.seccion}>
          <div className={crm.tituloSeccion}>
            Etiquetas
            <button type="button" className={org.enlaceIr} onClick={() => setGestionando(true)}>
              Gestionar
            </button>
          </div>
          <div className={crm.etiquetas}>
            {etiquetas.map((e) => {
              const puesta = puestas.has(e.id);
              const color = colorEtiqueta(e.color);
              return (
                <button
                  key={e.id}
                  type="button"
                  className={`${crm.etiqueta} ${puesta ? crm.etiquetaPuesta : ''}`}
                  style={{ borderColor: color, ...(puesta ? { background: color } : {}) }}
                  title={puesta ? 'Quitar' : 'Poner'}
                  onClick={() =>
                    void intentar(
                      () => api.post(`/conversaciones/${id}/etiquetas`, { etiquetaId: e.id, puesta: !puesta }),
                      'No se pudo cambiar la etiqueta',
                    )
                  }
                >
                  {!puesta && <span className={crm.puntoEtiqueta} style={{ background: color }} />}
                  {e.nombre}
                </button>
              );
            })}
          </div>
          <div className={crm.fila}>
            <input
              className={org.entrada}
              placeholder="Nueva etiqueta…"
              value={nuevaEtiqueta}
              maxLength={40}
              onChange={(e) => setNuevaEtiqueta(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void crearEtiqueta()}
            />
            <Boton variante="secundario" onClick={() => void crearEtiqueta()} disabled={!nuevaEtiqueta.trim()}>
              Crear
            </Boton>
          </div>
        </section>

        <section className={crm.seccion}>
          <div className={crm.tituloSeccion}>⏰ Recordatorios</div>
          {recordatorios.map((r) => {
            const vencido = !r.hechoEn && new Date(r.venceEn).getTime() <= ahora;
            return (
              <div key={r.id} className={`${crm.recordatorio} ${r.hechoEn ? crm.hecho : ''}`}>
                <input
                  type="checkbox"
                  checked={Boolean(r.hechoEn)}
                  title={r.hechoEn ? 'Volver a pendiente' : 'Marcar como hecho'}
                  onChange={(e) =>
                    void intentar(
                      () => api.patch(`/conversaciones/${id}/recordatorios/${r.id}`, { hecho: e.target.checked }),
                      'No se pudo actualizar',
                    )
                  }
                />
                <div className={crm.recordatorioTexto}>
                  <div>{r.texto}</div>
                  <div className={vencido ? crm.vencido : crm.detalleFicha}>
                    {vencido ? 'Venció ' : ''}
                    {formatearFechaHora(r.venceEn)}
                  </div>
                </div>
                <button
                  type="button"
                  className={org.botonIcono}
                  title="Borrar"
                  onClick={() => void intentar(() => api.delete(`/conversaciones/${id}/recordatorios/${r.id}`), 'No se pudo borrar')}
                >
                  🗑️
                </button>
              </div>
            );
          })}
          <input
            className={org.entrada}
            placeholder="¿Qué hay que hacer? (ej. enviarle la propuesta)"
            value={textoRecordatorio}
            maxLength={500}
            onChange={(e) => setTextoRecordatorio(e.target.value)}
          />
          <div className={crm.atajos}>
            {ATAJOS_RECORDATORIO.map((a) => (
              <button key={a.etiqueta} type="button" className={org.pestana} onClick={() => setVenceRecordatorio(aLocal(a.fecha()))}>
                {a.etiqueta}
              </button>
            ))}
          </div>
          <div className={crm.fila}>
            <input
              className={org.entrada}
              type="datetime-local"
              value={venceRecordatorio}
              onChange={(e) => setVenceRecordatorio(e.target.value)}
            />
            <Boton onClick={() => void agregarRecordatorio()} disabled={!textoRecordatorio.trim()}>
              Agregar
            </Boton>
          </div>
          <div className={crm.ayuda}>Cuando venza te aviso aquí en el panel y por WhatsApp a tu número de dueño.</div>
        </section>

        <section className={crm.seccion}>
          <div className={crm.tituloSeccion}>📝 Notas internas</div>
          <div className={crm.ayuda}>Solo las ve tu equipo, nunca el cliente.</div>
          <textarea
            className={`${org.entrada} ${crm.textarea}`}
            rows={3}
            placeholder="Escribe una nota…"
            value={nota}
            maxLength={4000}
            onChange={(e) => setNota(e.target.value)}
          />
          <div className={crm.fila}>
            <Boton onClick={() => void agregarNota()} disabled={!nota.trim()}>
              Agregar nota
            </Boton>
          </div>
          {notas.map((n) => (
            <div key={n.id} className={crm.nota}>
              <div className={crm.notaCabecera}>
                <span>
                  {n.autorEmail ?? 'Nota anterior del lead'} · {formatearRelativo(n.creadoEn)}
                </span>
                {(!n.autorId || n.autorId === yo) && (
                  <button
                    type="button"
                    className={org.enlaceIr}
                    onClick={() => void intentar(() => api.delete(`/conversaciones/${id}/notas-internas/${n.id}`), 'No se pudo borrar')}
                  >
                    Borrar
                  </button>
                )}
              </div>
              <div className={crm.notaTexto}>{n.texto}</div>
            </div>
          ))}
        </section>
      </div>

      {gestionando && <ModalEtiquetas etiquetas={etiquetas} onCerrar={() => setGestionando(false)} />}
    </aside>
  );
}
