import { useEffect, useState } from 'react';
import { urlFotoChat } from '../../lib/fotosChat';
import { inicialesDeChat } from './nombreChat';
import estilos from './Organizar.module.css';

type Props = {
  conversacionId: number;
  nombre: string;
  esGrupo: boolean;
  /** Lado en px. */
  tamano?: number;
};

/** La foto de perfil del chat, o sus iniciales (👥 en un grupo) mientras carga o si no tiene. */
export function Avatar({ conversacionId, nombre, esGrupo, tamano = 38 }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    setUrl(null);
    void urlFotoChat(conversacionId).then((u) => {
      if (vigente) setUrl(u);
    });
    return () => {
      vigente = false;
    };
  }, [conversacionId]);

  const estilo = { width: tamano, height: tamano, fontSize: Math.round(tamano * 0.34) };
  return (
    <span className={estilos.avatar} style={estilo} title={esGrupo ? 'Grupo' : undefined}>
      {url ? <img src={url} alt="" className={estilos.avatarFoto} /> : esGrupo ? '👥' : inicialesDeChat(nombre)}
    </span>
  );
}
