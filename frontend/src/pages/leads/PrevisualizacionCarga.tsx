import { useState } from 'react';
import { Boton } from '../../components/ui/Boton';
import { Badge } from '../../components/ui/Badge';
import type { PrevisualizacionLista } from '../../lib/types';
import { ETIQUETA_MOTIVO, TONO_MOTIVO } from './motivos';
import estilos from './PrevisualizacionCarga.module.css';

type Props = {
  previsualizacion: PrevisualizacionLista;
  guardando: boolean;
  onConfirmar: (nombre: string) => void;
  onCancelar: () => void;
};

/**
 * Pantalla intermedia entre "subir archivo" y "guardar la lista" (seccion
 * 3.2: "Mostrar al usuario un resumen antes de confirmar la carga"). Nada
 * de esto toca la base de datos todavia — el usuario decide si confirma
 * o corrige el archivo origen y vuelve a intentar.
 */
const FILAS_TABLA_MAX = 200;

export function PrevisualizacionCarga({ previsualizacion, guardando, onConfirmar, onCancelar }: Props) {
  const { nombreArchivoOriginal, resumen, columnasExtra, filasValidas, filasInvalidas } = previsualizacion;
  const [nombre, setNombre] = useState(() => nombreArchivoOriginal.replace(/\.(csv|xlsx)$/i, ''));

  const puedeConfirmar = nombre.trim().length > 0 && resumen.validas > 0 && !guardando;
  const filasAMostrar = filasValidas.slice(0, FILAS_TABLA_MAX);

  return (
    <div>
      <div className={estilos.encabezado}>
        <div>
          <div className={estilos.tituloArchivo}>{nombreArchivoOriginal}</div>
          <div className={estilos.subtitulo}>Revisa el resumen antes de guardar esta lista</div>
        </div>
      </div>

      <div className={estilos.tarjetas}>
        <div className={estilos.tarjetaStat}>
          <div className={estilos.statLabel}>Total leídas</div>
          <div className={estilos.statValor}>{resumen.totalFilas}</div>
        </div>
        <div className={estilos.tarjetaStat}>
          <div className={estilos.statLabel} style={{ color: 'var(--exito)' }}>
            Válidas
          </div>
          <div className={estilos.statValor} style={{ color: 'var(--exito)' }}>
            {resumen.validas}
          </div>
        </div>
        <div className={estilos.tarjetaStat}>
          <div className={estilos.statLabel} style={{ color: 'var(--peligro)' }}>
            Inválidas
          </div>
          <div className={estilos.statValor} style={{ color: 'var(--peligro)' }}>
            {resumen.invalidas}
          </div>
        </div>
        <div className={estilos.tarjetaStat}>
          <div className={estilos.statLabel}>Duplicadas</div>
          <div className={estilos.statValor}>{resumen.duplicadas}</div>
        </div>
      </div>

      {resumen.validas === 0 && (
        <p style={{ color: 'var(--peligro)', fontSize: 13, marginTop: -8, marginBottom: 18 }}>
          Ninguna fila pasó la validación. Corrige el archivo origen e intenta de nuevo.
        </p>
      )}

      <div className={estilos.campo}>
        <label className={estilos.etiquetaCampo} htmlFor="nombre-lista">
          Nombre de la lista
        </label>
        <input
          id="nombre-lista"
          className={estilos.input}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej. Clientes Lima — Setiembre 2026"
          disabled={guardando}
        />
        {columnasExtra.length > 0 && (
          <div className={estilos.variables}>
            Variables disponibles para tus mensajes:{' '}
            {columnasExtra.map((c) => (
              <code key={c}>{`{${c}}`}</code>
            ))}
          </div>
        )}
      </div>

      {filasAMostrar.length > 0 && (
        <div>
          <div className={estilos.tituloDetalle}>
            Vista previa de columnas ({resumen.validas} fila{resumen.validas === 1 ? '' : 's'} válida
            {resumen.validas === 1 ? '' : 's'})
          </div>
          <div className={estilos.tablaDatosContenedor}>
            <table className={estilos.tablaDatos}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Teléfono</th>
                  <th>Empresa</th>
                  <th>Rubro</th>
                  {columnasExtra.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filasAMostrar.map((fila) => (
                  <tr key={fila.filaNumero}>
                    <td className={estilos.numeroFila}>{fila.filaNumero}</td>
                    <td>{fila.telefono}</td>
                    <td>{fila.empresa}</td>
                    <td>{fila.rubro ?? '—'}</td>
                    {columnasExtra.map((c) => (
                      <td key={c}>{fila.datosExtra[c] ?? '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filasValidas.length > FILAS_TABLA_MAX && (
            <p className={estilos.notaTabla}>
              Mostrando las primeras {FILAS_TABLA_MAX} de {filasValidas.length} filas válidas.
            </p>
          )}
        </div>
      )}

      {filasInvalidas.length > 0 && (
        <div>
          <div className={estilos.tituloDetalle}>Filas excluidas y motivo ({filasInvalidas.length})</div>
          <div className={estilos.tablaExcluidos}>
            {filasInvalidas.map((fila, i) => (
              <div className={estilos.filaExcluida} key={i}>
                <span className={estilos.numeroFila}>Fila {fila.filaNumero}</span>
                <Badge tono={TONO_MOTIVO[fila.motivo]}>{ETIQUETA_MOTIVO[fila.motivo]}</Badge>
                <span className={estilos.datoReferencia}>{fila.datoReferencia}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={estilos.acciones}>
        <Boton variante="secundario" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </Boton>
        <Boton onClick={() => onConfirmar(nombre.trim())} disabled={!puedeConfirmar}>
          {guardando ? 'Guardando…' : `Confirmar carga (${resumen.validas} leads)`}
        </Boton>
      </div>
    </div>
  );
}
