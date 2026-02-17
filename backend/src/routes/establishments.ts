import { Router, Request, Response } from 'express';
import { db } from '../database/db';
import { Establishment } from '../types';
import { authenticateToken, requireSuperAdmin } from '../middleware/auth';
import { aerationService } from '../services/aerationService';
import { weatherService } from '../services/weatherService';
import crypto from 'crypto';
import axios from 'axios';

const router = Router();

// Endpoint público para el HMI (usando token)
router.get('/hmi/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    // Buscar establecimiento por token
    const establishment = db.prepare('SELECT * FROM establishments WHERE hmi_token = ?').get(token) as any;

    if (!establishment) {
      return res.status(401).json({ error: 'Token HMI inválido' });
    }

    // Obtener silos del establecimiento
    const silos = db.prepare('SELECT * FROM silos WHERE establishment_id = ?').all(establishment.id) as any[];

    // Obtener información de barras de sensores
    const sensorBars = db.prepare('SELECT silo_id FROM sensor_bars WHERE establishment_id = ? AND silo_id IS NOT NULL').all(establishment.id) as any[];
    const silosWithBars = new Set(sensorBars.map(sb => sb.silo_id));

    // Obtener estados actuales (próximas 24 horas, usamos la primera hora como actual)
    const states24h = await aerationService.get24HourStates(establishment.id);

    // Construir silos con estados reales y estados de 24h
    const silosWithStates = silos.map(silo => {
      const currentState = states24h.states[0]?.states.find(s => s.silo_id === silo.id);
      
      // Obtener temperatura actual promedio
      const currentTemp = db.prepare(`
        SELECT AVG(temperature) as avg_temp 
        FROM temperature_readings 
        WHERE silo_id = ? AND timestamp >= datetime('now', '-1 hour')
        GROUP BY timestamp ORDER BY timestamp DESC LIMIT 1
      `).get(silo.id) as any;

      // Extraer estados de 24h para este silo (solo is_on, sin razones)
      const next24h = states24h.states.map(hourState => {
        const siloState = hourState.states.find(s => s.silo_id === silo.id);
        return siloState?.is_on || false;
      });

      return {
        ...silo,
        current_state: currentState?.is_on || false,
        forced_off_reason: currentState?.forced_off_reason,
        has_sensor_bar: silosWithBars.has(silo.id),
        current_temp: currentTemp?.avg_temp,
        next_24h_states: next24h
      };
    });

    // Obtener clima actual usando weatherService
    const weatherData = await weatherService.getWeatherData(
      establishment.id,
      establishment.latitude,
      establishment.longitude
    );

    res.json({
      establishment,
      silos: silosWithStates,
      weather: weatherData[0] || null
    });
  } catch (error) {
    console.error('❌ Error en HMI:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor al procesar datos HMI',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Generar/Actualizar token HMI (Solo SuperAdmin)
router.post('/:id/hmi-token', authenticateToken, requireSuperAdmin, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const token = crypto.randomBytes(16).toString('hex');

    const result = db.prepare('UPDATE establishments SET hmi_token = ? WHERE id = ?').run(token, id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Establecimiento no encontrado' });
    }

    res.json({ token });
  } catch (error) {
    console.error('Error al generar token HMI:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Función para obtener la ciudad desde coordenadas con jerarquía completa
async function getCityFromCoords(lat: number, lon: number): Promise<string | null> {
  try {
    // Usamos Nominatim de OpenStreetMap (servicio gratuito, requiere User-Agent)
    const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
      params: {
        format: 'json',
        lat: lat,
        lon: lon,
        zoom: 10, // Nivel de ciudad
        addressdetails: 1
      },
      headers: {
        'User-Agent': 'SilosControlSystem/1.0'
      },
      timeout: 5000 // 5 segundos de timeout
    });

    if (response.data && response.data.address) {
      const addr = response.data.address;
      
      // Buscar la ubicación más específica disponible
      const locality = addr.city || addr.town || addr.village || addr.municipality || addr.county || addr.state_district;
      const province = addr.state;
      
      // Si tenemos localidad y provincia, mostrar ambas
      if (locality && province && locality !== province) {
        return `${locality}, ${province}`;
      }
      
      // Si solo tenemos localidad, mostrarla
      if (locality) {
        return locality;
      }
      
      // Si solo tenemos provincia, mostrarla
      if (province) {
        return province;
      }
      
      return null;
    }
    return null;
  } catch (error) {
    console.error('Error al obtener ciudad de Nominatim:', error);
    return null;
  }
}

// Todas las rutas requieren autenticación y permisos de super_admin
router.use(authenticateToken);
router.use(requireSuperAdmin);

// Listar todos los establecimientos
router.get('/', (req: Request, res: Response) => {
  try {
    const establishments = db.prepare(`
      SELECT * FROM establishments
      ORDER BY name
    `).all();

    res.json(establishments);
  } catch (error) {
    console.error('Error al listar establecimientos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener un establecimiento específico
router.get('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const establishment = db.prepare('SELECT * FROM establishments WHERE id = ?').get(id);

    if (!establishment) {
      return res.status(404).json({ error: 'Establecimiento no encontrado' });
    }

    res.json(establishment);
  } catch (error) {
    console.error('Error al obtener establecimiento:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Crear nuevo establecimiento
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, owner, latitude, longitude, max_operating_current, current_sensor_id } = req.body;

    // Validaciones
    if (!name || !owner || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ 
        error: 'Campos requeridos: name, owner, latitude, longitude' 
      });
    }

    // Validar que latitude y longitude sean números válidos
    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ 
        error: 'Latitude y longitude deben ser números válidos' 
      });
    }

    // Validar rangos de coordenadas
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return res.status(400).json({ 
        error: 'Coordenadas fuera de rango válido' 
      });
    }

    // Obtener nombre de la ciudad automáticamente
    const city = await getCityFromCoords(lat, lon);

    // Verificar si el establecimiento ya existe
    const existing = db.prepare('SELECT id FROM establishments WHERE name = ?').get(name);

    if (existing) {
      return res.status(409).json({ error: 'Ya existe un establecimiento con ese nombre' });
    }

    // Crear establecimiento
    const result = db.prepare(`
      INSERT INTO establishments 
      (name, owner, latitude, longitude, city, max_operating_current, current_sensor_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      owner,
      lat,
      lon,
      city,
      max_operating_current || null,
      current_sensor_id || null
    );

    const newEstablishment = db.prepare(`
      SELECT * FROM establishments WHERE id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({
      message: 'Establecimiento creado exitosamente',
      establishment: newEstablishment
    });
  } catch (error) {
    console.error('Error al crear establecimiento:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Actualizar establecimiento
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, owner, latitude, longitude, max_operating_current, current_sensor_id } = req.body;

    // Verificar que el establecimiento existe
    const existing = db.prepare('SELECT * FROM establishments WHERE id = ?').get(id) as Establishment | undefined;

    if (!existing) {
      return res.status(404).json({ error: 'Establecimiento no encontrado' });
    }

    // Validaciones
    if (!name || !owner || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ 
        error: 'Campos requeridos: name, owner, latitude, longitude' 
      });
    }

    // Validar que latitude y longitude sean números válidos
    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ 
        error: 'Latitude y longitude deben ser números válidos' 
      });
    }

    // Validar rangos de coordenadas
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return res.status(400).json({ 
        error: 'Coordenadas fuera de rango válido' 
      });
    }

    // Obtener nombre de la ciudad si las coordenadas cambiaron
    let city: string | undefined = existing.city;
    if (lat !== existing.latitude || lon !== existing.longitude) {
      city = (await getCityFromCoords(lat, lon)) || undefined;
    }

    // Verificar si el nuevo nombre ya existe en otro establecimiento
    if (name !== existing.name) {
      const nameExists = db.prepare('SELECT id FROM establishments WHERE name = ? AND id != ?').get(name, id);
      if (nameExists) {
        return res.status(409).json({ error: 'Ya existe un establecimiento con ese nombre' });
      }
    }

    // Actualizar establecimiento
    db.prepare(`
      UPDATE establishments 
      SET name = ?, owner = ?, latitude = ?, longitude = ?, city = ?,
          max_operating_current = ?, current_sensor_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name,
      owner,
      lat,
      lon,
      city,
      max_operating_current || null,
      current_sensor_id || null,
      id
    );

    const updated = db.prepare('SELECT * FROM establishments WHERE id = ?').get(id);

    res.json({
      message: 'Establecimiento actualizado exitosamente',
      establishment: updated
    });
  } catch (error) {
    console.error('Error al actualizar establecimiento:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Eliminar establecimiento
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Verificar que el establecimiento existe
    const establishment = db.prepare('SELECT * FROM establishments WHERE id = ?').get(id);

    if (!establishment) {
      return res.status(404).json({ error: 'Establecimiento no encontrado' });
    }

    // TODO: Verificar si hay silos o dispositivos asociados antes de eliminar
    // Por ahora, eliminamos directamente

    const result = db.prepare('DELETE FROM establishments WHERE id = ?').run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Establecimiento no encontrado' });
    }

    res.json({ message: 'Establecimiento eliminado exitosamente' });
  } catch (error) {
    console.error('Error al eliminar establecimiento:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
