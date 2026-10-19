import { useEffect, useState } from 'react';
import { Boton } from '../../components/ui/Boton';
import { Modal } from '../../components/ui/Modal';
import { api, ErrorApi } from '../../lib/api';
import type { ConversacionResumen, MensajeConversacion, PaginaConversaciones } from '../../lib/types';
import { inicialesDeChat, nombreDeChat } from './nombreChat';
import estilos from './Chat.module.css';

/** Como en WhatsApp: hasta 5 chats a la vez. */
const MAX_DESTINOS = 5;

type Props = {
  conversacionId: number;
  mensaje: MensajeConversacion;
  onCerrar: () => void;
};

type Resultado = { conversacionId: number; ok: boolean; error?: string };

export function ModalReenviar({ conversacionId, mensaje, onCerrar }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [chats, setChats] = useState<ConversacionResumen[] | null>(null);
  const [elegidos, setElegidos] = useState<ConversacionResumen[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallidos, setFallidos] = useState<Resultado[]>([]);

  useEffect(() => {
    let vigente = true;
    const t = setTimeout(() => {
      const params = new URLSearchParams({ filtro: 'todos' });
      if (busqueda.trim()) params.set('q', busqueda.trim());
      api
        .get<PaginaConversaciones>(`/conversaciones?${params.toString()}`)
        .then((p) => vigente && setChats(p.conversaciones.filter((c) => c.id !== conversacionId)))
        .catch(() => vigente && setChats([]));
    }, 250);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [busqueda, conversacionId]);

  function alternar(chat: ConversacionResumen) {
    setElegidos((prev) =>
      prev.some((c) => c.id === chat.id)
        ? prev.filter((c) => c.id !== chat.id)
        : prev.length < MAX_DESTINOS
          ? [...prev, chat]
          : prev,
    );
  }

  async function reenviar() {
    setEnviando(true);
    setError(null);
    try {
      const { resultados } = await api.post<{ resultados: Resultado[] }>(
        `/conversaciones/${conversacionId}/mensajes/${mensaje.id}/reenviar`,
        { destinos: elegidos.map((c) => c.id) },
      );
      const conError = resultados.filter((r) => !r.ok);
      if (!conError.length) {
        onCerrar();
        return;
      }
      setFallidos(conError);
      setElegidos((prev) => prev.filter((c) => conError.some((r) => r.conversacionId === c.id)));
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo reenviar');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Reenviar mensaje a…" onCerrar={onCerrar}>
      <div className={estilos.reenviarMensaje}>{mensaje.texto}</div>
      <input
        className={estilos.buscadorReenviar}
        placeholder="Buscar chat por nombre o número"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        autoFocus
      />
      <div className={estilos.listaReenviar}>
        {chats === null && <div className={estilos.notaReenviar}>Cargando chats…</div>}
        {chats?.length === 0 && <div className={estilos.notaReenviar}>No hay chats con ese nombre.</div>}
        {chats?.map((c) => {
          const nombre = nombreDeChat(c);
          const elegido = elegidos.some((e) => e.id === c.id);
          const fallo = fallidos.find((f) => f.conversacionId === c.id);
          return (
            <label key={c.id} className={`${estilos.filaReenviar} ${elegido ? estilos.filaElegida : ''}`}>
              <input
                type="checkbox"
                checked={elegido}
                disabled={!elegido && elegidos.length >= MAX_DESTINOS}
                onChange={() => alternar(c)}
              />
              <span className={estilos.avatarReenviar}>{c.esGrupo ? '👥' : inicialesDeChat(nombre)}</span>
              <span className={estilos.datosReenviar}>
                <span className={estilos.nombreReenviar}>{nombre}</span>
                <span className={estilos.notaReenviar}>{fallo ? `⚠️ ${fallo.error}` : c.esGrupo ? 'Grupo' : `+${c.telefono}`}</span>
              </span>
            </label>
          );
        })}
      </div>
      {error && <div className={estilos.errorCompositor}>{error}</div>}
      <div className={estilos.pieReenviar}>
        <span className={estilos.notaReenviar}>
          {elegidos.length ? `${elegidos.length} de ${MAX_DESTINOS} chats elegidos` : `Elige hasta ${MAX_DESTINOS} chats`}
        </span>
        <Boton onClick={() => void reenviar()} disabled={!elegidos.length || enviando}>
          {enviando ? 'Reenviando…' : 'Reenviar ➤'}
        </Boton>
      </div>
    </Modal>
  );
}
