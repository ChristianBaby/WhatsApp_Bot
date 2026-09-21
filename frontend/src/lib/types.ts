/**
 * Tipos compartidos del panel. Reflejan las formas que expone el backend
 * (backend/src/services/whatsapp/repositorio.ts es la fuente de verdad
 * para NumeroWhatsapp).
 */

export type EstadoNumero = 'esperando_qr' | 'conectado' | 'desconectado' | 'pausado_error';

export type NumeroWhatsapp = {
  id: number;
  etiqueta: string;
  telefono: string | null;
  estado: EstadoNumero;
  ultimoError: string | null;
  conectadoEn: string | null;
  creadoEn: string;
  actualizadoEn: string;
};
