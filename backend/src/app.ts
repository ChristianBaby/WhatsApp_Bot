import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { manejadorSSE } from './lib/sse.js';
import { requiereIdentidadGateway, requiereTokenGateway } from './middleware/identidadGateway.js';
import { crearTicketSSE, requiereTicketSSE } from './middleware/ticketSSE.js';
import { rutasSalud } from './routes/health.js';
import { rutasNumeros } from './routes/numeros.js';
import { rutasLeads } from './routes/leads.js';
import { rutasAdjuntos } from './routes/adjuntos.js';
import { rutasPublicaciones } from './routes/publicaciones.js';
import { rutasConversaciones } from './routes/conversaciones.js';
import { rutasConfiguracion } from './routes/configuracion.js';
import { rutasReportes } from './routes/reportes.js';
import { rutasResumen } from './routes/resumen.js';
import { rutasContactos } from './routes/contactos.js';
import { manejadorErrores, manejadorNoEncontrado } from './middleware/errorHandler.js';
import { crearLogger } from './lib/logger.js';

const log = crearLogger('http');
const aqui = path.dirname(fileURLToPath(import.meta.url));

export function crearApp() {
  const app = express();

  // Detras de Traefik/Coolify: necesario para que req.ip funcione bien.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Log de cada request (sin ruido de estaticos ni del latido de SSE).
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/webhooks')) return next();
    const inicio = Date.now();
    res.on('finish', () => {
      log.info(
        { metodo: req.method, ruta: req.path, estado: res.statusCode, ms: Date.now() - inicio },
        'request',
      );
    });
    next();
  });

  // --- API ---
  // /api/health queda sin proteger (lo usa el healthcheck de Docker, que no
  // pasa por el Gateway). Todo lo demas exige que el request venga del
  // Api_gateway (identidad ya resuelta por micro_login) — ver
  // middleware/identidadGateway.ts.
  app.use('/api', rutasSalud);

  // Assets de publicaciones (imagenes/video): un <img>/<video> del navegador
  // no manda headers de auth, asi que solo se exige el token del Gateway,
  // no un usuario. Los nombres de archivo son UUID (ver routes/adjuntos.ts),
  // no adivinables.
  // dotfiles 'deny' es obligatorio: en .listas/ viven los Excel originales de
  // las listas (datos personales) y NO deben poder descargarse por esta ruta
  // publica. Con el valor por defecto se servian (verificado en una prueba).
  app.use(
    '/api/uploads',
    requiereTokenGateway,
    express.static(env.rutaSubidas, { maxAge: '7d', fallthrough: false, dotfiles: 'deny' }),
  );

  // Canal de eventos en vivo (QR, progreso de campana, respuestas nuevas).
  // EventSource no manda Authorization, asi que usa un ticket de un solo uso
  // en vez del gate normal (ver middleware/ticketSSE.ts). DEBE ir antes de
  // app.use('/api', requiereIdentidadGateway): si no, ese gate lo rechaza
  // primero (no hay usuario) y el panel nunca recibe el QR ni los chats en
  // vivo. Nombre de ruta sin prefijo compartido con /api/eventos a
  // proposito: el Gateway deja pasar /api/whatsapp/eventos sin JWT (ver
  // auth.middleware.js), y si el ticket colgara de ahi quedaria expuesto.
  app.post('/api/sse-ticket', requiereIdentidadGateway, (_req, res) => {
    res.json({ ticket: crearTicketSSE() });
  });
  app.get('/api/eventos', requiereTokenGateway, requiereTicketSSE, manejadorSSE);

  app.use('/api', requiereIdentidadGateway);
  app.use('/api', rutasNumeros);
  app.use('/api', rutasLeads);
  app.use('/api', rutasAdjuntos);
  app.use('/api', rutasPublicaciones);
  app.use('/api', rutasConversaciones);
  app.use('/api', rutasConfiguracion);
  app.use('/api', rutasReportes);
  app.use('/api', rutasResumen);
  app.use('/api', rutasContactos);

  // 404 solo para rutas de API; lo demas puede caer al panel.
  app.use('/api', manejadorNoEncontrado);

  // --- Panel web ---
  // En produccion el backend sirve el build de Vite. En desarrollo el panel
  // corre aparte en :5173 y hace proxy hacia aqui.
  if (env.esProd) {
    const distPanel = path.resolve(aqui, '..', '..', 'frontend', 'dist');
    app.use(express.static(distPanel, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api|\/webhooks).*/, (_req, res) => {
      res.sendFile(path.join(distPanel, 'index.html'));
    });
  }

  app.use(manejadorErrores);

  return app;
}
