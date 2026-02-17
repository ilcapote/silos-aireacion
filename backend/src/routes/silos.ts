import { Router, Request, Response } from 'express';
import { db } from '../database/db';
import { authenticateToken } from '../middleware/auth';
import { aerationService } from '../services/aerationService';
import { weatherService } from '../services/weatherService';

const router = Router();

// ============================================
// RUTAS PÚBLICAS PARA HMI (antes del middleware de autenticación)
// ============================================

// Actualizar parámetros de un silo desde HMI (usando token HMI)
router.put('/:id/hmi', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const hmiToken = req.query.hmi_token as string;
    
    if (!hmiToken) {
      return res.status(401).json({ error: 'Token HMI requerido' });
    }

    // Verificar token HMI y obtener establecimiento
    const establishment = db.prepare('SELECT id FROM establishments WHERE hmi_token = ?').get(hmiToken) as any;
    if (!establishment) {
      return res.status(401).json({ error: 'Token HMI inválido' });
    }

    // Verificar que el silo pertenece al establecimiento
    const silo = db.prepare('SELECT * FROM silos WHERE id = ? AND establishment_id = ?').get(id, establishment.id) as any;
    if (!silo) {
      return res.status(404).json({ error: 'Silo no encontrado o no pertenece al establecimiento' });
    }

    const { min_temperature, max_temperature, min_humidity, max_humidity, manual_mode } = req.body;

    // Actualizar el silo
    db.prepare(`
      UPDATE silos 
      SET min_temperature = ?, max_temperature = ?, min_humidity = ?, max_humidity = ?, manual_mode = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      min_temperature ?? silo.min_temperature,
      max_temperature ?? silo.max_temperature,
      min_humidity ?? silo.min_humidity,
      max_humidity ?? silo.max_humidity,
      manual_mode ?? silo.manual_mode,
      id
    );

    console.log(`✅ HMI: Silo ${id} actualizado desde HMI`);
    res.json({ success: true, message: 'Silo actualizado correctamente' });
  } catch (error) {
    console.error('❌ Error actualizando silo desde HMI:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ============================================
// RUTAS PROTEGIDAS (requieren autenticación JWT)
// ============================================

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// Listar todos los silos configurados
router.get('/', (req: Request, res: Response) => {
  try {
    const silos = db.prepare(`
      SELECT 
        s.id,
        s.name as silo_name,
        s.min_temperature as temperature_min,
        s.max_temperature as temperature_max,
        s.min_humidity as humidity_min,
        s.max_humidity as humidity_max,
        CASE WHEN s.manual_mode = 'off' THEN 0 ELSE 1 END as aeration_enabled,
        s.establishment_id,
        s.aerator_position,
        e.name as establishment_name
      FROM silos s
      LEFT JOIN establishments e ON s.establishment_id = e.id
      ORDER BY s.name
    `).all();
    res.json(silos);
  } catch (error) {
    console.error('Error al listar silos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener configuración de un silo específico
router.get('/:silo_name', (req: Request, res: Response) => {
  try {
    const { silo_name } = req.params;
    const silo = db.prepare('SELECT * FROM silo_parameters WHERE silo_name = ?').get(silo_name);

    if (!silo) {
      return res.status(404).json({ error: 'Silo no encontrado' });
    }

    res.json(silo);
  } catch (error) {
    console.error('Error al obtener silo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Crear o actualizar configuración de silo
router.post('/', (req: Request, res: Response) => {
  try {
    const {
      silo_name,
      temperature_max,
      temperature_min,
      humidity_max,
      humidity_min,
      aeration_enabled
    } = req.body;

    if (!silo_name) {
      return res.status(400).json({ error: 'Nombre del silo requerido' });
    }

    // Verificar si el silo ya existe
    const existing = db.prepare('SELECT id FROM silo_parameters WHERE silo_name = ?').get(silo_name);

    if (existing) {
      // Actualizar
      db.prepare(`
        UPDATE silo_parameters 
        SET temperature_max = ?, temperature_min = ?, humidity_max = ?, 
            humidity_min = ?, aeration_enabled = ?, updated_at = CURRENT_TIMESTAMP
        WHERE silo_name = ?
      `).run(
        temperature_max ?? 25.0,
        temperature_min ?? 10.0,
        humidity_max ?? 70.0,
        humidity_min ?? 40.0,
        aeration_enabled ?? 1,
        silo_name
      );
    } else {
      // Crear
      db.prepare(`
        INSERT INTO silo_parameters 
        (silo_name, temperature_max, temperature_min, humidity_max, humidity_min, aeration_enabled)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        silo_name,
        temperature_max ?? 25.0,
        temperature_min ?? 10.0,
        humidity_max ?? 70.0,
        humidity_min ?? 40.0,
        aeration_enabled ?? 1
      );
    }

    const updated = db.prepare('SELECT * FROM silo_parameters WHERE silo_name = ?').get(silo_name);
    res.json(updated);
  } catch (error) {
    console.error('Error al guardar silo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Eliminar configuración de silo
router.delete('/:silo_name', (req: Request, res: Response) => {
  try {
    const { silo_name } = req.params;
    
    const result = db.prepare('DELETE FROM silo_parameters WHERE silo_name = ?').run(silo_name);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Silo no encontrado' });
    }

    res.json({ message: 'Silo eliminado exitosamente' });
  } catch (error) {
    console.error('Error al eliminar silo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener logs de aireación por silo_id
router.get('/:silo_id/logs', (req: Request, res: Response) => {
  try {
    const { silo_id } = req.params;
    const { limit = '100' } = req.query;

    const logs = db.prepare(`
      SELECT * FROM aeration_logs 
      WHERE silo_id = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `).all(parseInt(silo_id), parseInt(limit as string));

    res.json(logs);
  } catch (error) {
    console.error('Error al obtener logs:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * Obtener estados de silos con datos de clima para el dashboard
 * Este endpoint es para el frontend, incluye datos meteorológicos
 */
router.get('/establishment/:establishment_id/states', async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    const { establishment_id } = req.params;
    const estId = parseInt(establishment_id);

    // Obtener establecimiento
    const establishment = db.prepare('SELECT * FROM establishments WHERE id = ?').get(estId) as any;
    
    if (!establishment) {
      return res.status(404).json({ error: 'Establecimiento no encontrado' });
    }

    // Obtener silos del establecimiento
    const silos = db.prepare('SELECT * FROM silos WHERE establishment_id = ?').all(estId) as any[];
    
    // Obtener información de barras de sensores para estos silos
    const sensorBars = db.prepare('SELECT silo_id FROM sensor_bars WHERE establishment_id = ? AND silo_id IS NOT NULL').all(estId) as any[];
    const silosWithBars = new Set(sensorBars.map(sb => sb.silo_id));

    const dbTime = Date.now() - startTime;

    // Obtener datos meteorológicos
    const weatherStart = Date.now();
    const weatherData = await weatherService.getWeatherData(
      estId,
      establishment.latitude,
      establishment.longitude
    );
    const weatherTime = Date.now() - weatherStart;

    // Obtener estados de las próximas 24 horas
    const statesStart = Date.now();
    const states24h = await aerationService.get24HourStates(estId);
    const statesTime = Date.now() - statesStart;

    // Construir respuesta con información completa
    const silosWithStates = silos.map(silo => {
      // Obtener el estado actual (primera hora)
      const currentState = states24h.states[0]?.states.find(s => s.silo_id === silo.id);
      
      return {
        ...silo,
        current_state: currentState?.is_on || false,
        forced_off_reason: currentState?.forced_off_reason,
        has_sensor_bar: silosWithBars.has(silo.id)
      };
    });

    const totalTime = Date.now() - startTime;
    
    // Log de rendimiento
    console.log(`⏱️  [Rendimiento] Establecimiento ${estId}:`);
    console.log(`   📊 DB queries: ${dbTime}ms`);
    console.log(`   🌤️  Weather API: ${weatherTime}ms ${weatherTime < 100 ? '(caché)' : '(consulta nueva)'}`);
    console.log(`   📅 Estados 24h: ${statesTime}ms`);
    console.log(`   ⚡ Total: ${totalTime}ms`);

    res.json({
      establishment: {
        id: establishment.id,
        name: establishment.name,
        latitude: establishment.latitude,
        longitude: establishment.longitude,
        city: establishment.city
      },
      weather: weatherData[0] || null, // Clima actual
      weather_forecast: weatherData.slice(0, 24), // Próximas 24 horas
      silos: silosWithStates,
      states_24h: states24h
    });
  } catch (error) {
    console.error('Error al obtener estados de silos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
