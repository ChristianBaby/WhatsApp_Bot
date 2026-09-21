import { useEffect, useState } from 'react';
import { EncabezadoPagina } from '../components/ui/EncabezadoPagina';
import { EstadoVacio } from '../components/ui/EstadoVacio';
import { Boton } from '../components/ui/Boton';
import { Tarjeta } from '../components/ui/Tarjeta';
import { useSSE } from '../hooks/useSSE';
import { api } from '../lib/api';
import type { NumeroWhatsapp } from '../lib/types';
import { TarjetaNumero } from './conexion/TarjetaNumero';
import estilos from './conexion/Conexion.module.css';

export function Conexion() {
  const [numeros, setNumeros] = useState<NumeroWhatsapp[] | null>(null);
  const [vinculando, setVinculando] = useState(false);
  const [qrPorNumero, setQrPorNumero] = useState<Record<number, string | null>>({});

  useEffect(() => {
    api
      .get<NumeroWhatsapp[]>('/numeros')
      .then(setNumeros)
      .catch(() => setNumeros([]));
  }, []);

  useSSE(['numeros'], {
    'numero:actualizado': (datos) => {
      const numero = datos as NumeroWhatsapp;
      setNumeros((prev) => {
        const lista = prev ?? [];
        const existe = lista.some((n) => n.id === numero.id);
        return existe ? lista.map((n) => (n.id === numero.id ? numero : n)) : [...lista, numero];
      });
      // Una vez que deja de esperar QR (conectado, error o cancelado), no
      // tiene sentido seguir mostrando el ultimo codigo que llego.
      if (numero.estado !== 'esperando_qr') {
        setQrPorNumero((prev) => ({ ...prev, [numero.id]: null }));
      }
    },
    'numero:qr': (datos) => {
      const { id, qr } = datos as { id: number; qr: string | null };
      setQrPorNumero((prev) => ({ ...prev, [id]: qr }));
    },
  });

  async function vincularNuevoNumero() {
    setVinculando(true);
    try {
      const siguiente = (numeros?.length ?? 0) + 1;
      const numero = await api.post<NumeroWhatsapp>('/numeros', { etiqueta: `WhatsApp ${siguiente}` });
      setNumeros((prev) => [...(prev ?? []), numero]);
    } finally {
      setVinculando(false);
    }
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <EncabezadoPagina
        titulo="Conexión de WhatsApp"
        descripcion="Puedes vincular varios números y repartir tus campañas entre ellos."
        acciones={
          <Boton onClick={() => void vincularNuevoNumero()} disabled={vinculando}>
            {vinculando ? 'Vinculando…' : '+ Vincular número'}
          </Boton>
        }
      />

      {numeros === null && (
        <Tarjeta>
          <EstadoVacio titulo="Cargando…" />
        </Tarjeta>
      )}

      {numeros !== null && numeros.length === 0 && (
        <Tarjeta>
          <EstadoVacio
            titulo="Todavía no hay números vinculados"
            detalle="Vincula tu primer número de WhatsApp para empezar a enviar campañas. Podrás renombrarlo en cualquier momento."
          />
        </Tarjeta>
      )}

      {numeros !== null && numeros.length > 0 && (
        <div className={estilos.lista}>
          {numeros.map((numero) => (
            <TarjetaNumero key={numero.id} numero={numero} qr={qrPorNumero[numero.id] ?? null} />
          ))}
        </div>
      )}
    </div>
  );
}
