import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { initDatabase } from './database/db';
import authRoutes from './routes/auth';
import usersRoutes from './routes/users';
import establishmentsRoutes from './routes/establishments';
import boardsRoutes from './routes/boards';
import silosManagementRoutes from './routes/silos_management';
import silosRoutes from './routes/silos';
import esp32Routes from './routes/esp32';
import sensorsRoutes from './routes/sensors';

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Servir frontend estático en producción
const publicPath = path.join(__dirname, '../public');
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
  console.log('📁 Frontend estático servido desde:', publicPath);
}

// Inicializar base de datos
initDatabase();

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/establishments', establishmentsRoutes);
app.use('/api/boards', boardsRoutes);
app.use('/api/silos-management', silosManagementRoutes);
app.use('/api/silos', silosRoutes);
app.use('/api/esp32', esp32Routes);
app.use('/api/sensors', sensorsRoutes);

// Rutas de compatibilidad ESP32 (sin prefijo /esp32)
app.use('/api', esp32Routes);

// Ruta de health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Ruta raíz
app.get('/', (req, res) => {
  res.json({
    message: 'API de Sistema de Aireación de Silos',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      establishments: '/api/establishments',
      boards: '/api/boards',
      silos_management: '/api/silos-management',
      silos: '/api/silos',
      esp32: '/api/esp32',
      sensors: '/api/sensors'
    }
  });
});

// Manejo de errores global
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error no manejado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Catch-all para React Router (debe ir después de todas las rutas API)
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, '../public/index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// Iniciar servidor
app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`🚀 Servidor corriendo en todas las interfaces en el puerto ${PORT}`);
  console.log(`🏠 Local: http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔐 Super admin: super_admin / nopormuchomadrugarsevenlasvacasencamison`);
});
