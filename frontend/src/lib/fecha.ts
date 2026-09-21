/** Convierte un ISO timestamp en "hace X min/h/dias", como en la maquetacion. */
export function formatearRelativo(iso: string | null): string {
  if (!iso) return '';

  const diffMs = Date.now() - new Date(iso).getTime();
  const segundos = Math.floor(diffMs / 1000);

  if (segundos < 60) return 'hace un momento';

  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `hace ${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;

  const dias = Math.floor(horas / 24);
  if (dias === 1) return 'hace 1 día';
  if (dias < 30) return `hace ${dias} días`;

  const meses = Math.floor(dias / 30);
  return meses === 1 ? 'hace 1 mes' : `hace ${meses} meses`;
}

/** dd/mm/aaaa, como las fechas de la maquetacion (listas, reportes...). Hora local del navegador. */
export function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** HH:MM, hora local del navegador. */
export function formatearHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** dd/mm/aaaa · HH:MM, para fechas de envio de publicaciones (importa la hora exacta). */
export function formatearFechaHora(iso: string): string {
  return `${formatearFecha(iso)} · ${formatearHora(iso)}`;
}
