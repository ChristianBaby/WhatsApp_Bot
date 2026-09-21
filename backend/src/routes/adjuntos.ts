import crypto from 'node:crypto';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { env } from '../config/env.js';
import { solicitudInvalida } from '../lib/errors.js';
import { manejarAsync } from '../middleware/errorHandler.js';

export const rutasAdjuntos = Router();

const EXTENSIONES_IMAGEN = ['.jpg', '.jpeg', '.png', '.webp'];
const EXTENSIONES_VIDEO = ['.mp4', '.mov', '.webm'];

/**
 * Adjunto opcional de una publicacion (seccion 3.3: imagen o video corto).
 * Se guarda directo en disco (no en memoria) con un nombre generado, para
 * no confiar en el nombre original del archivo ni pisar otro con el mismo nombre.
 */
const subida = multer({
  storage: multer.diskStorage({
    destination: env.rutaSubidas,
    filename: (_req, archivo, cb) => {
      const extension = path.extname(archivo.originalname).toLowerCase();
      cb(null, `${crypto.randomUUID()}${extension}`);
    },
  }),
  limits: { fileSize: 16 * 1024 * 1024 }, // 16MB: de sobra para una imagen o un video corto
  fileFilter: (_req, archivo, cb) => {
    const extension = path.extname(archivo.originalname).toLowerCase();
    if (EXTENSIONES_IMAGEN.includes(extension) || EXTENSIONES_VIDEO.includes(extension)) return cb(null, true);
    cb(solicitudInvalida('Formato no soportado. Sube una imagen (.jpg, .png, .webp) o un video (.mp4, .mov, .webm)'));
  },
});

rutasAdjuntos.post(
  '/adjuntos',
  subida.single('archivo'),
  manejarAsync(async (req, res) => {
    if (!req.file) throw solicitudInvalida('Falta el archivo');

    const extension = path.extname(req.file.originalname).toLowerCase();
    const tipo = EXTENSIONES_IMAGEN.includes(extension) ? 'imagen' : 'video';

    res.status(201).json({
      ruta: req.file.filename,
      tipo,
      nombreOriginal: req.file.originalname,
      tamano: req.file.size,
      url: `/uploads/${req.file.filename}`,
    });
  }),
);
