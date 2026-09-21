import { useState } from 'react';
import { EncabezadoPagina } from '../components/ui/EncabezadoPagina';
import { Boton } from '../components/ui/Boton';
import { Cola } from './publicaciones/Cola';
import { NuevaPublicacion } from './publicaciones/NuevaPublicacion';
import estilos from './Publicaciones.module.css';

type SubVista = 'cola' | 'nueva';

export function Publicaciones() {
  const [subVista, setSubVista] = useState<SubVista>('cola');
  const [publicacionEditando, setPublicacionEditando] = useState<number | null>(null);

  function irANueva() {
    setPublicacionEditando(null);
    setSubVista('nueva');
  }

  function editar(id: number) {
    setPublicacionEditando(id);
    setSubVista('nueva');
  }

  function volverALaCola() {
    setSubVista('cola');
    setPublicacionEditando(null);
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Publicaciones"
        descripcion="Crea campañas y revisa la cola de envíos."
        acciones={
          subVista === 'cola' ? <Boton onClick={irANueva}>+ Nueva publicación</Boton> : undefined
        }
      />

      <div className={estilos.pestanas}>
        <button
          className={`${estilos.pestana} ${subVista === 'cola' ? estilos.activa : ''}`}
          onClick={volverALaCola}
        >
          Cola de campañas
        </button>
        <button
          className={`${estilos.pestana} ${subVista === 'nueva' ? estilos.activa : ''}`}
          onClick={irANueva}
        >
          {publicacionEditando ? 'Editando publicación' : 'Nueva publicación'}
        </button>
      </div>

      {subVista === 'cola' && <Cola onEditar={editar} />}
      {subVista === 'nueva' && (
        <NuevaPublicacion publicacionId={publicacionEditando} onGuardado={volverALaCola} onCancelar={volverALaCola} />
      )}
    </div>
  );
}
