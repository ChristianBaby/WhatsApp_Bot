import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { manejadorSSE } from './lib/sse.js';
import { rutasSalud } from './routes/health.js';
import { rutasNumeros } from './routes/numeros.js';
import { rutasLeads } from './routes/leads.js';
import { rutasAdjuntos } from './routes/adjuntos.js';
import { rutasPublicaciones } from './routes/publicaciones.js';
import { rutasConversaciones } from './routes/conversaciones.js';
import { rutasConfiguracion } from './routes/configuracion.js';
import { rutasReportes } from './routes/reportes.js';
import { rutasResumen } from './routes/resumen.js';
import { manejadorErrores, manejadorNoEncontrado } from './middleware/errorHandler.js';
import { crearLogger } from './lib/logger.js';

const log = crearLogger('http');
const aqui = path.dirname(fileURLToPath(import.meta.url));

export function crearApp() {
  const app = express();

  // Detras de Traefik/Coolify: necesario para que req.ip y las cookies
  // seguras funcionen bien.
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
  app.use('/api', rutasSalud);
  app.use('/api', rutasNumeros);
  app.use('/api', rutasLeads);
  app.use('/api', rutasAdjuntos);
  app.use('/api', rutasPublicaciones);
  app.use('/api', rutasConversaciones);
  app.use('/api', rutasConfiguracion);
  app.use('/api', rutasReportes);
  app.use('/api', rutasResumen);

  // Canal de eventos en vivo (QR, progreso de campana, respuestas nuevas).
  app.get('/api/eventos', manejadorSSE);

  // Archivos subidos (imagenes/videos de las publicaciones).
  app.use('/uploads', express.static(env.rutaSubidas, { maxAge: '7d', fallthrough: true }));

  // 404 solo para rutas de API; lo demas puede caer al panel.
  app.use('/api', manejadorNoEncontrado);

  // --- Panel web ---
  // En produccion el backend sirve el build de Vite. En desarrollo el panel
  // corre aparte en :5173 y hace proxy hacia aqui.
  if (env.esProd) {
    const distPanel = path.resolve(aqui, '..', '..', 'frontend', 'dist');
    app.use(express.static(distPanel, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api|\/webhooks|\/uploads).*/, (_req, res) => {
      res.sendFile(path.join(distPanel, 'index.html'));
    });
  }

  app.use(manejadorErrores);

  return app;
}
