import { useState } from 'react';
import { EncabezadoPagina } from '../components/ui/EncabezadoPagina';
import { Boton } from '../components/ui/Boton';
import { Segmentado } from '../components/ui/Segmentado';
import { Icono } from '../components/ui/Icono';
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
          subVista === 'cola' ? <Boton onClick={irANueva}>
              <Icono nombre="mas" tamano={16} />
              Nueva publicación
            </Boton> : undefined
        }
      />

      <div className={estilos.pestanas}>
        <Segmentado<SubVista>
          etiqueta="Vista de publicaciones"
          valor={subVista}
          onCambio={(v) => (v === 'cola' ? volverALaCola() : irANueva())}
          opciones={[
            { valor: 'cola', etiqueta: 'Cola de campañas' },
            { valor: 'nueva', etiqueta: publicacionEditando ? 'Editando publicación' : 'Nueva publicación' },
          ]}
        />
      </div>

      {subVista === 'cola' && <Cola onEditar={editar} />}
      {subVista === 'nueva' && (
        <NuevaPublicacion publicacionId={publicacionEditando} onGuardado={volverALaCola} onCancelar={volverALaCola} />
      )}
    </div>
  );
}
