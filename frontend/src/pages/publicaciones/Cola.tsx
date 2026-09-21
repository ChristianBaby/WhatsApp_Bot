import { useEffect, useState } from 'react';
import { Tarjeta } from '../../components/ui/Tarjeta';
import { EstadoVacio } from '../../components/ui/EstadoVacio';
import { useSSE } from '../../hooks/useSSE';
import { api } from '../../lib/api';
import type { PublicacionConProgreso } from '../../lib/types';
import { TarjetaCampana } from './TarjetaCampana';
import estilos from './Cola.module.css';

export function Cola({ onEditar }: { onEditar: (id: number) => void }) {
  const [publicaciones, setPublicaciones] = useState<PublicacionConProgreso[] | null>(null);

  useEffect(() => {
    api
      .get<PublicacionConProgreso[]>('/publicaciones')
      .then(setPublicaciones)
      .catch(() => setPublicaciones([]));
  }, []);

  useSSE(['publicaciones'], {
    'publicacion:actualizada': (datos) => {
      const pub = datos as PublicacionConProgreso;
      setPublicaciones((prev) => {
        const lista = prev ?? [];
        const existe = lista.some((p) => p.id === pub.id);
        const siguiente = existe ? lista.map((p) => (p.id === pub.id ? pub : p)) : [pub, ...lista];
        // Mismo orden que el backend: en_curso primero, luego pausada, programada, borrador...
        const prioridad: Record<string, number> = {
          en_curso: 0,
          pausada: 1,
          programada: 2,
          borrador: 3,
          completada: 4,
          cancelada: 5,
        };
        return [...siguiente].sort((a, b) => (prioridad[a.estado] ?? 9) - (prioridad[b.estado] ?? 9));
      });
    },
  });

  if (publicaciones === null) {
    return (
      <Tarjeta>
        <EstadoVacio titulo="Cargando…" />
      </Tarjeta>
    );
  }

  if (publicaciones.length === 0) {
    return (
      <Tarjeta>
        <EstadoVacio
          titulo="Todavía no hay publicaciones"
          detalle="Crea tu primera campaña con el botón «+ Nueva publicación»."
        />
      </Tarjeta>
    );
  }

  return (
    <div className={estilos.lista}>
      {publicaciones.map((pub) => (
        <TarjetaCampana key={pub.id} publicacion={pub} onEditar={() => onEditar(pub.id)} />
      ))}
    </div>
  );
}
