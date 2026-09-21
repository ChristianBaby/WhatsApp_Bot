import { useEffect, useState } from 'react';
import { Tarjeta } from '../../components/ui/Tarjeta';
import { Boton } from '../../components/ui/Boton';
import { Icono } from '../../components/ui/Icono';
import { api, ErrorApi } from '../../lib/api';
import type { ListaLeads, NumeroWhatsapp, Publicacion, ResultadoDryRun } from '../../lib/types';
import { AdjuntoCampo, type Adjunto } from './AdjuntoCampo';
import { PanelRitmo, SIN_OVERRIDES, type OverridesRitmo } from './PanelRitmo';
import { ModalDryRun } from './ModalDryRun';
import { ModalPrueba } from './ModalPrueba';
import estilos from './NuevaPublicacion.module.css';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function isoAFechaHoraLocal(iso: string): { fecha: string; hora: string } {
  const d = new Date(iso);
  return {
    fecha: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    hora: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

const HOY = isoAFechaHoraLocal(new Date().toISOString()).fecha;

type Props = {
  publicacionId: number | null;
  onGuardado: () => void;
  onCancelar: () => void;
};

export function NuevaPublicacion({ publicacionId, onGuardado, onCancelar }: Props) {
  const [listas, setListas] = useState<ListaLeads[] | null>(null);
  const [numeros, setNumeros] = useState<NumeroWhatsapp[] | null>(null);
  const [defaults, setDefaults] = useState<Record<string, unknown>>({});
  const [cargandoInicial, setCargandoInicial] = useState(publicacionId !== null);

  const [nombre, setNombre] = useState('');
  const [listaId, setListaId] = useState<number | null>(null);
  const [variantes, setVariantes] = useState<string[]>(['']);
  const [adjunto, setAdjunto] = useState<Adjunto | null>(null);
  const [catalogoUrl, setCatalogoUrl] = useState('');
  const [numeroIdsSeleccionados, setNumeroIdsSeleccionados] = useState<number[]>([]);
  const [fecha, setFecha] = useState(HOY);
  const [hora, setHora] = useState('09:00');
  const [overridesRitmo, setOverridesRitmo] = useState<OverridesRitmo>(SIN_OVERRIDES);

  const [guardando, setGuardando] = useState<'borrador' | 'programar' | 'editar' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [dryRunCargando, setDryRunCargando] = useState(false);
  const [resultadoDryRun, setResultadoDryRun] = useState<ResultadoDryRun | null>(null);
  const [mostrarModalPrueba, setMostrarModalPrueba] = useState(false);

  useEffect(() => {
    void Promise.all([
      api.get<ListaLeads[]>('/listas-leads').then(setListas),
      api.get<NumeroWhatsapp[]>('/numeros').then(setNumeros),
      api.get<Record<string, unknown>>('/configuracion').then(setDefaults),
    ]);
  }, []);

  useEffect(() => {
    if (!publicacionId) return;
    api.get<Publicacion>(`/publicaciones/${publicacionId}`).then((pub) => {
      setNombre(pub.nombre);
      setListaId(pub.listaId);
      setVariantes(pub.variantesMensaje.length > 0 ? pub.variantesMensaje : ['']);
      setAdjunto(
        pub.adjuntoRuta && pub.adjuntoTipo
          ? {
              ruta: pub.adjuntoRuta,
              tipo: pub.adjuntoTipo,
              nombreOriginal: pub.adjuntoNombreOriginal ?? pub.adjuntoRuta,
              url: `/uploads/${pub.adjuntoRuta}`,
              tamano: 0,
            }
          : null,
      );
      setCatalogoUrl(pub.catalogoUrl ?? '');
      setNumeroIdsSeleccionados(pub.numeroIds);
      const { fecha: f, hora: h } = isoAFechaHoraLocal(pub.programadaPara);
      setFecha(f);
      setHora(h);
      setOverridesRitmo({
        pausaMinSegundos: pub.pausaMinSegundos,
        pausaMaxSegundos: pub.pausaMaxSegundos,
        tamanoLote: pub.tamanoLote,
        pausaEntreLotesMinutos: pub.pausaEntreLotesMinutos,
        horarioInicio: pub.horarioInicio,
        horarioFin: pub.horarioFin,
        maxMensajes: pub.maxMensajes,
      });
      setCargandoInicial(false);
    });
  }, [publicacionId]);

  function actualizarVariante(i: number, valor: string) {
    setVariantes((prev) => prev.map((v, idx) => (idx === i ? valor : v)));
  }
  function agregarVariante() {
    setVariantes((prev) => [...prev, '']);
  }
  function quitarVariante(i: number) {
    setVariantes((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }
  function alternarNumero(id: number) {
    setNumeroIdsSeleccionados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function validar(): string | null {
    if (!nombre.trim()) return 'Ponle un nombre a la campaña';
    if (!listaId) return 'Elige una lista de leads';
    if (!variantes.some((v) => v.trim())) return 'Escribe al menos un texto de mensaje';
    if (numeroIdsSeleccionados.length === 0) return 'Elige al menos un número para enviar';
    if (!fecha) return 'Elige una fecha de envío';
    return null;
  }

  function construirPayload() {
    return {
      nombre: nombre.trim(),
      listaId,
      variantesMensaje: variantes.map((v) => v.trim()).filter(Boolean),
      adjuntoRuta: adjunto?.ruta ?? null,
      adjuntoTipo: adjunto?.tipo ?? null,
      adjuntoNombreOriginal: adjunto?.nombreOriginal ?? null,
      catalogoUrl: catalogoUrl.trim() || null,
      numeroIds: numeroIdsSeleccionados,
      programadaPara: new Date(`${fecha}T${hora || '00:00'}:00`).toISOString(),
      ...overridesRitmo,
    };
  }

  async function guardar(accion: 'borrador' | 'programar' | 'editar') {
    const mensajeError = validar();
    if (mensajeError) {
      setError(mensajeError);
      return;
    }
    setError(null);
    setGuardando(accion);
    try {
      if (accion === 'editar' && publicacionId) {
        await api.patch(`/publicaciones/${publicacionId}`, construirPayload());
      } else {
        await api.post('/publicaciones', { ...construirPayload(), accion });
      }
      onGuardado();
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo guardar la publicación');
    } finally {
      setGuardando(null);
    }
  }

  async function ejecutarDryRun() {
    if (!listaId || !variantes.some((v) => v.trim()) || numeroIdsSeleccionados.length === 0) {
      setError('Elige una lista, escribe un mensaje y selecciona al menos un número antes de probar');
      return;
    }
    setError(null);
    setDryRunCargando(true);
    try {
      const resultado = await api.post<ResultadoDryRun>('/publicaciones/dry-run', {
        listaId,
        variantesMensaje: variantes.map((v) => v.trim()).filter(Boolean),
        catalogoUrl: catalogoUrl.trim() || null,
        numeroIds: numeroIdsSeleccionados,
        ...overridesRitmo,
      });
      setResultadoDryRun(resultado);
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo simular la campaña');
    } finally {
      setDryRunCargando(false);
    }
  }

  function abrirModalPrueba() {
    if (!variantes.some((v) => v.trim()) || numeroIdsSeleccionados.length === 0) {
      setError('Escribe un mensaje y selecciona al menos un número antes de probar');
      return;
    }
    setError(null);
    setMostrarModalPrueba(true);
  }

  if (cargandoInicial || listas === null || numeros === null) {
    return (
      <Tarjeta>
        <p style={{ color: 'var(--texto-suave)', fontSize: 13 }}>Cargando…</p>
      </Tarjeta>
    );
  }

  const numerosSeleccionadosInfo = numeros
    .filter((n) => numeroIdsSeleccionados.includes(n.id))
    .map((n) => ({ id: n.id, etiqueta: n.etiqueta }));

  return (
    <div className={estilos.layout}>
      <Tarjeta className={estilos.formulario}>
        <div className={estilos.campo}>
          <label className={estilos.etiqueta}>Nombre de la campaña</label>
          <input
            className={estilos.input}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Promo planos octubre"
          />
        </div>

        <div className={estilos.campo}>
          <label className={estilos.etiqueta}>Lista de leads</label>
          <select className={estilos.select} value={listaId ?? ''} onChange={(e) => setListaId(Number(e.target.value) || null)}>
            <option value="">Elige una lista…</option>
            {listas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre} ({l.validas} válidas)
              </option>
            ))}
          </select>
        </div>

        <div className={estilos.campo}>
          <label className={estilos.etiqueta}>
            Variantes del mensaje <span className={estilos.etiquetaAyuda}>(se elige una al azar por contacto)</span>
          </label>
          {variantes.map((v, i) => (
            <div className={estilos.variante} key={i}>
              <textarea
                className={estilos.textarea}
                rows={2}
                value={v}
                onChange={(e) => actualizarVariante(i, e.target.value)}
                placeholder="Hola {contacto}, le escribimos de Universoft para compartirle esta publicación de {empresa} 👇"
              />
              {variantes.length > 1 && (
                <button className={estilos.varianteQuitar} onClick={() => quitarVariante(i)} aria-label="Quitar variante">
                  <Icono nombre="cerrar" tamano={16} />
                </button>
              )}
            </div>
          ))}
          <button className={estilos.agregarVariante} onClick={agregarVariante}>
            + Agregar otra variante
          </button>
        </div>

        <div className={estilos.campo}>
          <label className={estilos.etiqueta}>Adjunto</label>
          <AdjuntoCampo valor={adjunto} onCambio={setAdjunto} />
        </div>

        <div className={estilos.campo}>
          <label className={estilos.etiqueta}>
            Link al catálogo de WhatsApp <span className={estilos.etiquetaAyuda}>(opcional)</span>
          </label>
          <input
            className={estilos.input}
            value={catalogoUrl}
            onChange={(e) => setCatalogoUrl(e.target.value)}
            placeholder="https://wa.me/c/51987654321"
          />
        </div>

        <div className={estilos.campo}>
          <label className={estilos.etiqueta}>Números que envían esta campaña</label>
          <div className={estilos.numeros}>
            {numeros.length === 0 && <p style={{ fontSize: 13, color: 'var(--texto-tenue)' }}>Todavía no has vinculado ningún número.</p>}
            {numeros.map((n) => (
              <label key={n.id} className={`${estilos.numeroItem} ${n.estado !== 'conectado' ? estilos.numeroDeshabilitado : ''}`}>
                <input
                  type="checkbox"
                  checked={numeroIdsSeleccionados.includes(n.id)}
                  onChange={() => alternarNumero(n.id)}
                />
                {n.etiqueta} {n.estado !== 'conectado' && '(desconectado ahora, pero puedes elegirlo)'}
              </label>
            ))}
          </div>
        </div>

        <div className={estilos.campo}>
          <div className={estilos.parFechaHora}>
            <div>
              <label className={estilos.etiqueta}>Fecha de envío</label>
              <input type="date" className={estilos.input} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div>
              <label className={estilos.etiqueta}>Hora</label>
              <input type="time" className={estilos.input} value={hora} onChange={(e) => setHora(e.target.value)} />
            </div>
          </div>
        </div>

        {error && <div className={estilos.error}>{error}</div>}

        <div className={estilos.acciones}>
          {publicacionId ? (
            <>
              <Boton variante="secundario" onClick={onCancelar} disabled={guardando !== null}>
                Cancelar
              </Boton>
              <Boton onClick={() => void guardar('editar')} disabled={guardando !== null}>
                {guardando === 'editar' ? 'Guardando…' : 'Guardar cambios'}
              </Boton>
            </>
          ) : (
            <>
              <Boton variante="secundario" onClick={() => void guardar('borrador')} disabled={guardando !== null}>
                {guardando === 'borrador' ? 'Guardando…' : 'Guardar como borrador'}
              </Boton>
              <Boton onClick={() => void guardar('programar')} disabled={guardando !== null}>
                {guardando === 'programar' ? 'Programando…' : 'Programar campaña'}
              </Boton>
            </>
          )}
        </div>
      </Tarjeta>

      <PanelRitmo
        defaults={defaults}
        overrides={overridesRitmo}
        onCambio={setOverridesRitmo}
        onDryRun={() => void ejecutarDryRun()}
        dryRunCargando={dryRunCargando}
        onAbrirPrueba={abrirModalPrueba}
      />

      {resultadoDryRun && <ModalDryRun resultado={resultadoDryRun} onCerrar={() => setResultadoDryRun(null)} />}
      {mostrarModalPrueba && (
        <ModalPrueba
          numerosDisponibles={numerosSeleccionadosInfo}
          listaId={listaId}
          variantesMensaje={variantes}
          catalogoUrl={catalogoUrl.trim() || null}
          onCerrar={() => setMostrarModalPrueba(false)}
        />
      )}
    </div>
  );
}
