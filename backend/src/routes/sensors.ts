import { Router, Request, Response } from 'express';
import { db } from '../database/db';
import { authenticateToken, requireSuperAdmin } from '../middleware/auth';

const router = Router();

/**
 * GET /api/sensors/silo/:id/temperature-history
 * Obtener el historial de temperaturas de un silo (últimos 7 días)
 * Soporta autenticación por JWT o por token HMI.
 * Se coloca ANTES del middleware global para manejar el token HMI.
 */
router.get('/silo/:id/temperature-history', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const hmiToken = req.query.hmi_token as string;

    // Caso 1: Intento de autenticación por Token HMI
    if (hmiToken) {
      const establishment = db.prepare(`
        SELECT e.id 
        FROM establishments e
        JOIN silos s ON s.establishment_id = e.id
        WHERE e.hmi_token = ? AND s.id = ?
      `).get(hmiToken, id);

      if (!establishment) {
        return res.status(401).json({ error: 'Token HMI inválido o no autorizado para este silo' });
      }
    } 
    // Caso 2: Intento de autenticación por JWT (si no hay hmiToken)
    else {
      // Usamos el middleware manualmente para este endpoint si no hay hmiToken
      return authenticateToken(req, res, () => {
        handleTemperatureHistory(req, res);
      });
    }

    return handleTemperatureHistory(req, res);
  } catch (error) {
    console.error('Error al obtener historial de temperaturas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

async function handleTemperatureHistory(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const readings = db.prepare(`
      SELECT 
        tr.temperature, 
        tr.timestamp, 
        ts.serial_number,
        tr.sensor_id
      FROM temperature_readings tr
      JOIN temperature_sensors ts ON tr.sensor_id = ts.id
      WHERE tr.silo_id = ?
      AND tr.timestamp >= datetime('now', '-7 days')
      ORDER BY tr.timestamp ASC
    `).all(id) as any[];

    const groupedData: Record<string, any> = {};
    readings.forEach(r => {
      const time = r.timestamp;
      if (!groupedData[time]) {
        groupedData[time] = { timestamp: time };
      }
      groupedData[time][r.serial_number] = r.temperature;
    });

    res.json(Object.values(groupedData));
  } catch (error) {
    console.error('Error en handleTemperatureHistory:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// Todas las demás rutas de sensores requieren autenticación y permisos de super_admin
router.use(authenticateToken);
router.use(requireSuperAdmin);

/**
 * GET /api/sensors/temperature-sensors
 * Listar todos los sensores de temperatura
 */
router.get('/temperature-sensors', (req: Request, res: Response) => {
  console.log('GET /api/sensors/temperature-sensors - Request by:', req.user?.username);
  try {
    const sensors = db.prepare(`
      SELECT * FROM temperature_sensors
      ORDER BY created_at DESC
    `).all();
    res.json(sensors);
  } catch (error) {
    console.error('Error al listar sensores:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * GET /api/sensors/temperature-sensors/available
 * Listar sensores que no están asignados a ninguna barra
 */
router.get('/temperature-sensors/available', (req: Request, res: Response) => {
  console.log('GET /api/sensors/temperature-sensors/available - Request by:', req.user?.username);
  try {
    const sensors = db.prepare(`
      SELECT * FROM temperature_sensors
      WHERE id NOT IN (
        SELECT sensor1_id FROM sensor_bars WHERE sensor1_id IS NOT NULL
        UNION SELECT sensor2_id FROM sensor_bars WHERE sensor2_id IS NOT NULL
        UNION SELECT sensor3_id FROM sensor_bars WHERE sensor3_id IS NOT NULL
        UNION SELECT sensor4_id FROM sensor_bars WHERE sensor4_id IS NOT NULL
        UNION SELECT sensor5_id FROM sensor_bars WHERE sensor5_id IS NOT NULL
        UNION SELECT sensor6_id FROM sensor_bars WHERE sensor6_id IS NOT NULL
        UNION SELECT sensor7_id FROM sensor_bars WHERE sensor7_id IS NOT NULL
        UNION SELECT sensor8_id FROM sensor_bars WHERE sensor8_id IS NOT NULL
      )
      ORDER BY serial_number
    `).all();
    res.json(sensors);
  } catch (error) {
    console.error('Error al listar sensores disponibles:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * POST /api/sensors/temperature-sensors
 * Crear un nuevo sensor
 */
router.post('/temperature-sensors', (req: Request, res: Response) => {
  console.log('POST /api/sensors/temperature-sensors - Data:', req.body);
  try {
    const { serial_number, description } = req.body;

    if (!serial_number) {
      return res.status(400).json({ error: 'El número de serie es requerido' });
    }

    // Verificar si ya existe
    const existing = db.prepare('SELECT id FROM temperature_sensors WHERE serial_number = ?').get(serial_number);
    if (existing) {
      return res.status(409).json({ error: 'Ya existe un sensor con ese número de serie' });
    }

    const result = db.prepare(`
      INSERT INTO temperature_sensors (serial_number, description)
      VALUES (?, ?)
    `).run(serial_number, description || null);

    const newSensor = db.prepare('SELECT * FROM temperature_sensors WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newSensor);
  } catch (error) {
    console.error('Error al crear sensor:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * PUT /api/sensors/temperature-sensors/:id
 * Actualizar un sensor
 */
router.put('/temperature-sensors/:id', (req: Request, res: Response) => {
  console.log('PUT /api/sensors/temperature-sensors/%s - Data:', req.params.id, req.body);
  try {
    const { id } = req.params;
    const { serial_number, description } = req.body;

    if (!serial_number) {
      return res.status(400).json({ error: 'El número de serie es requerido' });
    }

    // Verificar que el sensor existe
    const existing = db.prepare('SELECT * FROM temperature_sensors WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Sensor no encontrado' });
    }

    // Verificar si el nuevo serial ya existe en otro sensor
    const duplicate = db.prepare('SELECT id FROM temperature_sensors WHERE serial_number = ? AND id != ?').get(serial_number, id);
    if (duplicate) {
      return res.status(409).json({ error: 'Ya existe otro sensor con ese número de serie' });
    }

    db.prepare(`
      UPDATE temperature_sensors 
      SET serial_number = ?, description = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(serial_number, description || null, id);

    const updated = db.prepare('SELECT * FROM temperature_sensors WHERE id = ?').get(id);
    res.json(updated);
  } catch (error) {
    console.error('Error al actualizar sensor:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * DELETE /api/sensors/temperature-sensors/:id
 * Eliminar un sensor
 */
router.delete('/temperature-sensors/:id', (req: Request, res: Response) => {
  console.log('DELETE /api/sensors/temperature-sensors/%s', req.params.id);
  try {
    const { id } = req.params;

    // Verificar si está en uso en alguna barra
    const inUse = db.prepare(`
      SELECT id FROM sensor_bars 
      WHERE sensor1_id = ? OR sensor2_id = ? OR sensor3_id = ? OR sensor4_id = ?
         OR sensor5_id = ? OR sensor6_id = ? OR sensor7_id = ? OR sensor8_id = ?
    `).get(id, id, id, id, id, id, id, id);

    if (inUse) {
      return res.status(400).json({ 
        error: 'No se puede eliminar el sensor porque está asignado a una barra de sensores' 
      });
    }

    const result = db.prepare('DELETE FROM temperature_sensors WHERE id = ?').run(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Sensor no encontrado' });
    }

    res.json({ message: 'Sensor eliminado exitosamente' });
  } catch (error) {
    console.error('Error al eliminar sensor:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * GET /api/sensors/sensor-bars
 * Listar todas las barras de sensores
 */
router.get('/sensor-bars', (req: Request, res: Response) => {
  console.log('GET /api/sensors/sensor-bars - Request by:', req.user?.username);
  try {
    const bars = db.prepare(`
      SELECT sb.*, e.name as establishment_name, s.name as silo_name
      FROM sensor_bars sb
      LEFT JOIN establishments e ON sb.establishment_id = e.id
      LEFT JOIN silos s ON sb.silo_id = s.id
      ORDER BY sb.created_at DESC
    `).all() as any[];

    // Formatear la respuesta para incluir los objetos de sensores
    const formattedBars = bars.map(bar => {
      const sensors = [];
      for (let i = 1; i <= 8; i++) {
        const sensorId = bar[`sensor${i}_id`];
        if (sensorId) {
          const sensor = db.prepare('SELECT * FROM temperature_sensors WHERE id = ?').get(sensorId);
          sensors.push({ position: i, sensor });
        } else {
          sensors.push({ position: i, sensor: null });
        }
      }
      return {
        ...bar,
        sensors
      };
    });

    res.json(formattedBars);
  } catch (error) {
    console.error('Error al listar barras de sensores:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * POST /api/sensors/sensor-bars
 * Crear una nueva barra de sensores
 */
router.post('/sensor-bars', (req: Request, res: Response) => {
  console.log('POST /api/sensors/sensor-bars - Data:', req.body);
  try {
    const { name, establishment_id, silo_id, sensors } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'El nombre de la barra es requerido' });
    }

    // Preparar los IDs de los sensores y validar que no estén duplicados en la misma barra
    const sensorIds = [];
    const seenSensors = new Set();
    for (let i = 1; i <= 8; i++) {
      const sId = sensors[`sensor${i}_id`] || null;
      if (sId) {
        if (seenSensors.has(sId)) {
          return res.status(400).json({ error: `El sensor ID ${sId} está duplicado en la misma barra` });
        }
        seenSensors.add(sId);

        // Validar si el sensor ya está en otra barra
        const inOtherBar = db.prepare(`
          SELECT id FROM sensor_bars 
          WHERE (sensor1_id = ? OR sensor2_id = ? OR sensor3_id = ? OR sensor4_id = ?
             OR sensor5_id = ? OR sensor6_id = ? OR sensor7_id = ? OR sensor8_id = ?)
        `).get(sId, sId, sId, sId, sId, sId, sId, sId);

        if (inOtherBar) {
          return res.status(409).json({ error: `El sensor con ID ${sId} ya está asignado a otra barra` });
        }
      }
      sensorIds.push(sId);
    }

    const result = db.prepare(`
      INSERT INTO sensor_bars (
        name, establishment_id, silo_id,
        sensor1_id, sensor2_id, sensor3_id, sensor4_id,
        sensor5_id, sensor6_id, sensor7_id, sensor8_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name, 
      establishment_id || null, 
      silo_id || null,
      ...sensorIds
    );

    res.status(201).json({ id: result.lastInsertRowid, message: 'Barra creada exitosamente' });
  } catch (error: any) {
    console.error('Error al crear barra de sensores:', error);
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Ya existe una barra con ese nombre o uno de los sensores ya está asignado' });
    }
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * PUT /api/sensors/sensor-bars/:id
 * Actualizar una barra de sensores
 */
router.put('/sensor-bars/:id', (req: Request, res: Response) => {
  console.log('PUT /api/sensors/sensor-bars/%s - Data:', req.params.id, req.body);
  try {
    const { id } = req.params;
    const { name, establishment_id, silo_id, sensors } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'El nombre de la barra es requerido' });
    }

    // Preparar los IDs de los sensores y validar que no estén duplicados en la misma barra
    const sensorIds = [];
    const seenSensors = new Set();
    for (let i = 1; i <= 8; i++) {
      const sId = sensors[`sensor${i}_id`] || null;
      if (sId) {
        if (seenSensors.has(sId)) {
          return res.status(400).json({ error: `El sensor ID ${sId} está duplicado en la misma barra` });
        }
        seenSensors.add(sId);

        // Validar si el sensor ya está en OTRA barra (excluyendo la actual)
        const inOtherBar = db.prepare(`
          SELECT id FROM sensor_bars 
          WHERE id != ? AND (
                sensor1_id = ? OR sensor2_id = ? OR sensor3_id = ? OR sensor4_id = ?
             OR sensor5_id = ? OR sensor6_id = ? OR sensor7_id = ? OR sensor8_id = ?
          )
        `).get(id, sId, sId, sId, sId, sId, sId, sId, sId);

        if (inOtherBar) {
          return res.status(409).json({ error: `El sensor con ID ${sId} ya está asignado a otra barra` });
        }
      }
      sensorIds.push(sId);
    }

    db.prepare(`
      UPDATE sensor_bars SET
        name = ?, establishment_id = ?, silo_id = ?,
        sensor1_id = ?, sensor2_id = ?, sensor3_id = ?, sensor4_id = ?,
        sensor5_id = ?, sensor6_id = ?, sensor7_id = ?, sensor8_id = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name,
      establishment_id || null,
      silo_id || null,
      ...sensorIds,
      id
    );

    res.json({ message: 'Barra actualizada exitosamente' });
  } catch (error: any) {
    console.error('Error al actualizar barra de sensores:', error);
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Ya existe otra barra con ese nombre o uno de los sensores ya está asignado' });
    }
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * DELETE /api/sensors/sensor-bars/:id
 * Eliminar una barra de sensores
 */
router.delete('/sensor-bars/:id', (req: Request, res: Response) => {
  console.log('DELETE /api/sensors/sensor-bars/%s', req.params.id);
  try {
    const { id } = req.params;
    const result = db.prepare('DELETE FROM sensor_bars WHERE id = ?').run(id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Barra no encontrada' });
    }

    res.json({ message: 'Barra eliminada exitosamente' });
  } catch (error) {
    console.error('Error al eliminar barra de sensores:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * POST /api/sensors/temperature-readings
 * Registrar una lectura de temperatura (Endpoint para ESP32)
 */
router.post('/temperature-readings', (req: Request, res: Response) => {
  console.log('POST /api/sensors/temperature-readings - Data:', req.body);
  try {
    const { serial_number, temperature, timestamp } = req.body;

    if (!serial_number || temperature === undefined) {
      return res.status(400).json({ error: 'Número de serie y temperatura son requeridos' });
    }

    // 1. Buscar el sensor
    const sensor = db.prepare('SELECT id FROM temperature_sensors WHERE serial_number = ?').get(serial_number) as any;
    if (!sensor) {
      return res.status(404).json({ error: `Sensor con número de serie ${serial_number} no encontrado` });
    }

    // 2. Buscar la barra y el silo asociados a este sensor
    const bar = db.prepare(`
      SELECT id, silo_id FROM sensor_bars 
      WHERE sensor1_id = ? OR sensor2_id = ? OR sensor3_id = ? OR sensor4_id = ?
         OR sensor5_id = ? OR sensor6_id = ? OR sensor7_id = ? OR sensor8_id = ?
    `).get(sensor.id, sensor.id, sensor.id, sensor.id, sensor.id, sensor.id, sensor.id, sensor.id) as any;

    const bar_id = bar ? bar.id : null;
    const silo_id = bar ? bar.silo_id : null;

    // 3. Insertar la lectura
    const finalTimestamp = timestamp || new Date().toISOString();
    
    db.prepare(`
      INSERT INTO temperature_readings (sensor_id, bar_id, silo_id, temperature, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(sensor.id, bar_id, silo_id, temperature, finalTimestamp);

    res.status(201).json({ message: 'Lectura registrada exitosamente' });
  } catch (error) {
    console.error('Error al registrar lectura de temperatura:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;