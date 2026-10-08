import { useEffect, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Boton } from '../../components/ui/Boton';
import { EstadoVacio } from '../../components/ui/EstadoVacio';
import { Tarjeta } from '../../components/ui/Tarjeta';
import { api, ErrorApi } from '../../lib/api';
import { formatearFecha } from '../../lib/fecha';
import type { ContactoBloqueado } from '../../lib/types';
import estilos from './LeadsDeLista.module.css';

/**
 * Lista de "no contactar": quienes pidieron la baja (lo detecta el bot) y los
 * que se bloquean a mano. Ninguna campaña ni respuesta automática les escribe.
 */
export function NoContactar() {
  const [contactos, setContactos] = useState<ContactoBloqueado[] | null>(null);
  const [telefono, setTelefono] = useState('');
  const [nota, setNota] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    setContactos(await api.get<ContactoBloqueado[]>('/contactos-bloqueados'));
  }

  useEffect(() => {
    void cargar().catch(() => setContactos([]));
  }, []);

  async function ejecutar(accion: () => Promise<unknown>) {
    setProcesando(true);
    setError(null);
    try {
      await accion();
      await cargar();
      return true;
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo completar la acción');
      return false;
    } finally {
      setProcesando(false);
    }
  }

  async function bloquear() {
    const ok = await ejecutar(() => api.post('/contactos-bloqueados', { telefono, nota: nota || undefined }));
    if (ok) {
      setTelefono('');
      setNota('');
    }
  }

  function desbloquear(c: ContactoBloqueado) {
    const quien = c.empresa ?? `+${c.telefono}`;
    const aviso =
      c.motivo === 'pidio_baja'
        ? `${quien} PIDIÓ no recibir mensajes. Desbloquéalo solo si te volvió a escribir pidiendo información.\n\n¿Desbloquear?`
        : `¿Desbloquear a ${quien}? Volverá a poder recibir campañas.`;
    if (!window.confirm(aviso)) return;
    void ejecutar(() => api.delete(`/contactos-bloqueados/${c.telefono}`));
  }

  return (
    <Tarjeta>
      <div style={{ fontSize: 13, color: 'var(--texto-suave)', marginBottom: 12 }}>
        Las campañas y las respuestas automáticas nunca les escriben. El bot agrega aquí, solo, a quien pide la baja
        ("no me escriban", "STOP"…).
      </div>

      <div className={estilos.formulario} style={{ gridTemplateColumns: '1fr 1.5fr auto' }}>
        <input
          className={estilos.input}
          placeholder="Teléfono a bloquear (ej. 987 654 321)"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
        />
        <input
          className={estilos.input}
          placeholder="Nota (opcional, ej. pidió por llamada que no le escriban)"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
        />
        <Boton onClick={() => void bloquear()} disabled={procesando || !telefono.trim()}>
          Bloquear
        </Boton>
      </div>

      {error && <div className={estilos.error}>{error}</div>}

      {contactos === null && <EstadoVacio titulo="Cargando…" />}
      {contactos !== null && contactos.length === 0 && (
        <EstadoVacio titulo="Nadie en la lista" detalle="Aquí aparecerán quienes pidan no recibir mensajes." />
      )}

      {contactos !== null &&
        contactos.map((c) => (
          <div className={estilos.fila} key={c.telefono} style={{ gridTemplateColumns: '1.2fr 130px 2fr 100px 110px' }}>
            <div className={estilos.empresa}>{c.empresa ?? 'Sin lista'}</div>
            <div>+{c.telefono}</div>
            <div className={estilos.suave} title={c.textoOrigen ?? undefined}>
              {c.textoOrigen ? `"${c.textoOrigen}"` : '—'}
            </div>
            <div>
              <Badge tono={c.motivo === 'pidio_baja' ? 'alerta' : 'neutro'}>
                {c.motivo === 'pidio_baja' ? 'Pidió baja' : 'Manual'}
              </Badge>
            </div>
            <div className={estilos.acciones}>
              <span className={estilos.suave}>{formatearFecha(c.creadoEn)}</span>
              <Boton variante="texto" onClick={() => desbloquear(c)} disabled={procesando}>
                Quitar
              </Boton>
            </div>
          </div>
        ))}
    </Tarjeta>
  );
}
