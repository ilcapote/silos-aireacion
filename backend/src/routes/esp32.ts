import { Router, Request, Response } from 'express';
import { db } from '../database/db';
import { aerationService } from '../services/aerationService';

const router = Router();

/**
 * Normaliza dirección MAC a formato estándar (mayúsculas)
 */
function standardizeMac(mac: string): string {
  return mac.toUpperCase();
}

/**
 * POST /api/esp32/get_silos
 * El ESP32 consulta qué silos tiene asignados
 * Compatible con firmware existente
 */
router.post('/get_silos', async (req: Request, res: Response) => {
  try {
    const { mac_address } = req.body;

    if (!mac_address) {
      return res.status(400).json({ error: 'MAC address is required' });
    }

    const macStd = standardizeMac(mac_address);

    // Buscar el dispositivo ESP32 registrado
    const device = db.prepare('SELECT * FROM boards WHERE mac_address = ?').get(macStd) as any;

    if (!device) {
      return res.status(404).json({ error: 'Device not registered' });
    }

    // Obtener los silos del establecimiento
    const silos = db.prepare(
      'SELECT id, aerator_position FROM silos WHERE establishment_id = ?'
    ).all(device.establishment_id) as any[];

    const siloInfo = silos.map(silo => ({
      id: silo.id,
      position: silo.aerator_position
    }));

    res.json({
      silos: siloInfo,
      count: siloInfo.length
    });
  } catch (error) {
    console.error('Error en get_silos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * POST /api/esp32/get_24h_states
 * El ESP32 consulta estados para las próximas 24 horas
 * Compatible con firmware existente
 */
router.post('/get_24h_states', async (req: Request, res: Response) => {
  try {
    const { mac_address } = req.body;

    if (!mac_address) {
      return res.status(400).json({ error: 'MAC address is required' });
    }

    const macStd = standardizeMac(mac_address);

    // Buscar el dispositivo ESP32
    const device = db.prepare('SELECT * FROM boards WHERE mac_address = ?').get(macStd) as any;

    if (!device) {
      return res.status(404).json({ error: 'Device not registered' });
    }

    // Obtener estados de las próximas 24 horas
    const statesData = await aerationService.get24HourStates(device.establishment_id);

    res.json(statesData);
  } catch (error) {
    console.error('Error en get_24h_states:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * GET /api/check_modified/:mac_address
 * El ESP32 pregunta si debe actualizar su configuración
 * Compatible con firmware existente
 */
router.get('/check_modified/:mac_address', (req: Request, res: Response) => {
  try {
    const { mac_address } = req.params;
    const macStd = standardizeMac(mac_address);

    // Buscar el dispositivo
    const device = db.prepare('SELECT * FROM boards WHERE mac_address = ?').get(macStd) as any;

    if (!device) {
      return res.status(404).json({ error: 'Placa no registrada' });
    }

    // Verificar si algún silo ha sido modificado
    const modified = aerationService.checkModified(device.establishment_id);

    res.json({ modified });
  } catch (error) {
    console.error('Error en check_modified:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * POST /api/log_aerator_state
 * El ESP32 reporta tiempo de funcionamiento del aireador
 * Compatible con firmware existente
 */
router.post('/log_aerator_state', (req: Request, res: Response) => {
  try {
    const { mac_address, position, state, duration } = req.body;

    if (!mac_address || position === undefined || duration === undefined) {
      return res.status(400).json({ error: 'Faltan datos requeridos' });
    }

    const macStd = standardizeMac(mac_address);

    // Buscar la placa
    const board = db.prepare('SELECT * FROM boards WHERE mac_address = ?').get(macStd) as any;

    if (!board) {
      return res.status(404).json({ error: 'Placa no registrada' });
    }

    // Buscar el silo correspondiente
    const silo = db.prepare(
      'SELECT * FROM silos WHERE establishment_id = ? AND aerator_position = ?'
    ).get(board.establishment_id, position) as any;

    if (!silo) {
      return res.status(404).json({ error: 'Silo no encontrado para esta posición' });
    }

    // Registrar el tiempo de funcionamiento
    db.prepare(
      'INSERT INTO aeration_logs (silo_id, runtime_hours) VALUES (?, ?)'
    ).run(silo.id, parseFloat(duration));

    res.json({ message: 'Tiempo de funcionamiento registrado correctamente' });
  } catch (error) {
    console.error('Error en log_aerator_state:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * POST /api/log_runtime
 * Alias para log_aerator_state (compatibilidad)
 */
router.post('/log_runtime', (req: Request, res: Response) => {
  try {
    const { mac_address, position, duration } = req.body;

    if (!mac_address || position === undefined || duration === undefined) {
      return res.status(400).json({ error: 'Faltan datos requeridos' });
    }

    const macStd = standardizeMac(mac_address);
    const board = db.prepare('SELECT * FROM boards WHERE mac_address = ?').get(macStd) as any;

    if (!board) {
      return res.status(404).json({ error: 'Placa no registrada' });
    }

    const silo = db.prepare(
      'SELECT * FROM silos WHERE establishment_id = ? AND aerator_position = ?'
    ).get(board.establishment_id, position) as any;

    if (!silo) {
      return res.status(404).json({ error: 'Silo no encontrado para esta posición' });
    }

    db.prepare(
      'INSERT INTO aeration_logs (silo_id, runtime_hours) VALUES (?, ?)'
    ).run(silo.id, parseFloat(duration));

    res.json({ message: 'Tiempo de funcionamiento registrado correctamente' });
  } catch (error) {
    console.error('Error en log_runtime:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * POST /api/heartbeat
 * El ESP32 envía un heartbeat periódico con su MAC y versión de firmware.
 * Compatible con firmware existente (también accesible como /api/esp32/heartbeat)
 */
router.post('/heartbeat', (req: Request, res: Response) => {
  try {
    const { mac_address, firmware_version } = req.body;

    if (!mac_address) {
      return res.status(400).json({ error: 'MAC address no proporcionada' });
    }

    const macStd = standardizeMac(mac_address);

    // Verificar que el dispositivo esté registrado
    const board = db.prepare('SELECT * FROM boards WHERE mac_address = ?').get(macStd) as any;
    if (!board) {
      return res.status(404).json({ error: 'Dispositivo no registrado' });
    }

    const now = new Date().toISOString();

    // Insertar registro de heartbeat
    db.prepare(`
      INSERT INTO device_heartbeats (mac_address, firmware_version, timestamp)
      VALUES (?, ?, ?)
    `).run(macStd, firmware_version || null, now);

    // Actualizar last_heartbeat y status en boards
    db.prepare(`
      UPDATE boards
      SET last_heartbeat = ?, status = 'online', firmware_version = COALESCE(?, firmware_version), updated_at = ?
      WHERE mac_address = ?
    `).run(now, firmware_version || null, now, macStd);

    // Limpiar heartbeats con más de 1 mes de antigüedad para este dispositivo
    db.prepare(`
      DELETE FROM device_heartbeats WHERE mac_address = ? AND timestamp < datetime('now', '-1 month')
    `).run(macStd);

    res.json({ status: 'success' });
  } catch (error) {
    console.error('Error en heartbeat:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * GET /api/esp32/heartbeats/:mac_address
 * Obtiene el historial de heartbeats de un dispositivo para el frontend.
 * Parámetro query: period = '24h' | '7d' (default: '24h')
 */
router.get('/heartbeats/:mac_address', (req: Request, res: Response) => {
  try {
    const { mac_address } = req.params;
    const period = (req.query.period as string) || '24h';
    const macStd = standardizeMac(mac_address);

    // Verificar que el dispositivo esté registrado
    const board = db.prepare(`
      SELECT b.*, e.name as establishment_name
      FROM boards b
      LEFT JOIN establishments e ON b.establishment_id = e.id
      WHERE b.mac_address = ?
    `).get(macStd) as any;

    if (!board) {
      return res.status(404).json({ error: 'Dispositivo no registrado' });
    }

    const intervalMap: Record<string, string> = {
      '24h': '-1 day',
      '7d':  '-7 days',
    };
    const interval = intervalMap[period] || '-1 day';

    const heartbeats = db.prepare(`
      SELECT id, mac_address, firmware_version, timestamp
      FROM device_heartbeats
      WHERE mac_address = ? AND timestamp >= datetime('now', ?)
      ORDER BY timestamp DESC
    `).all(macStd, interval) as any[];

    res.json({
      board,
      period,
      total: heartbeats.length,
      heartbeats,
    });
  } catch (error) {
    console.error('Error en GET heartbeats:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * GET /api/esp32/heartbeats
 * Lista todos los dispositivos con su resumen de heartbeats (para selector en frontend)
 */
router.get('/heartbeats', (req: Request, res: Response) => {
  try {
    const boards = db.prepare(`
      SELECT b.mac_address, b.status, b.last_heartbeat, b.firmware_version,
             e.name as establishment_name,
             (SELECT COUNT(*) FROM device_heartbeats dh
              WHERE dh.mac_address = b.mac_address
              AND dh.timestamp >= datetime('now', '-1 day')) as heartbeats_24h
      FROM boards b
      LEFT JOIN establishments e ON b.establishment_id = e.id
      ORDER BY e.name, b.mac_address
    `).all() as any[];

    res.json(boards);
  } catch (error) {
    console.error('Error en GET heartbeats list:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * POST /api/reboot
 * El ESP32 notifica al servidor que acaba de reiniciarse.
 * Registra el evento en device_reboots y marca el board como online.
 */
router.post('/reboot', (req: Request, res: Response) => {
  try {
    const { mac_address, reason } = req.body;

    if (!mac_address) {
      return res.status(400).json({ error: 'MAC address no proporcionada' });
    }

    const macStd = standardizeMac(mac_address);

    const board = db.prepare('SELECT * FROM boards WHERE mac_address = ?').get(macStd) as any;
    if (!board) {
      return res.status(404).json({ error: 'Dispositivo no registrado' });
    }

    const now = new Date().toISOString();

    // Registrar el reinicio
    db.prepare(`
      INSERT INTO device_reboots (mac_address, reason, timestamp)
      VALUES (?, ?, ?)
    `).run(macStd, reason || 'Power cycle', now);

    // Actualizar status del board
    db.prepare(`
      UPDATE boards SET status = 'online', updated_at = ? WHERE mac_address = ?
    `).run(now, macStd);

    // Limpiar registros viejos de este dispositivo
    db.prepare(`
      DELETE FROM device_reboots WHERE mac_address = ? AND timestamp < datetime('now', '-1 month')
    `).run(macStd);

    console.log(`🔄 Reboot registrado: ${macStd} — motivo: ${reason || 'Power cycle'}`);
    res.json({ status: 'success' });
  } catch (error) {
    console.error('Error en reboot:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * POST /api/corriente
 * El sensor de corriente reporta su valor actual. Se guarda solo el último valor (UPSERT).
 */
router.post('/corriente', (req: Request, res: Response) => {
  try {
    const { device_id, corriente } = req.body;

    if (!device_id || corriente === undefined) {
      return res.status(400).json({ error: 'device_id y corriente son requeridos' });
    }

    const valor = parseFloat(corriente);
    if (isNaN(valor)) {
      return res.status(400).json({ error: 'corriente debe ser un número válido' });
    }

    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO current_readings (device_id, corriente, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(device_id) DO UPDATE SET corriente = excluded.corriente, updated_at = excluded.updated_at
    `).run(device_id, valor, now);

    res.json({ status: 'success' });
  } catch (error) {
    console.error('Error en POST corriente:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * GET /api/corriente?device_id=X
 * El ESP32 consulta el último valor de corriente y la corriente máxima del establecimiento.
 */
router.get('/corriente', (req: Request, res: Response) => {
  try {
    const { device_id } = req.query;

    if (!device_id) {
      return res.status(400).json({ error: 'device_id es requerido' });
    }

    const reading = db.prepare(
      'SELECT corriente, updated_at FROM current_readings WHERE device_id = ?'
    ).get(device_id as string) as { corriente: number; updated_at: string } | undefined;

    if (!reading) {
      return res.status(404).json({ error: 'No hay datos de corriente para este sensor' });
    }

    // Buscar el establecimiento que tiene este sensor configurado
    const establishment = db.prepare(
      'SELECT max_operating_current FROM establishments WHERE current_sensor_id = ?'
    ).get(device_id as string) as { max_operating_current: number | null } | undefined;

    res.json({
      corriente: reading.corriente,
      updated_at: reading.updated_at,
      max_corriente: establishment?.max_operating_current ?? null,
    });
  } catch (error) {
    console.error('Error en GET corriente:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * POST /api/device_action_log
 * El ESP32 registra una acción ON/OFF de un aireador.
 */
router.post('/device_action_log', (req: Request, res: Response) => {
  try {
    const { mac_address, action, position, result, message } = req.body;

    if (!mac_address || !action || position === undefined) {
      return res.status(400).json({ error: 'Faltan datos requeridos: mac_address, action, position' });
    }

    const macStd = standardizeMac(mac_address);

    const board = db.prepare('SELECT * FROM boards WHERE mac_address = ?').get(macStd) as any;
    if (!board) {
      return res.status(404).json({ error: 'Dispositivo no registrado' });
    }

    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO device_action_logs (mac_address, action, position, result, message, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(macStd, action, position, result || 'success', message || null, now);

    res.json({ status: 'success' });
  } catch (error) {
    console.error('Error en device_action_log:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * GET /api/esp32/reboots
 * Lista todos los dispositivos con conteo de reinicios (para selector en frontend)
 */
router.get('/reboots', (req: Request, res: Response) => {
  try {
    const boards = db.prepare(`
      SELECT b.mac_address, b.status, b.last_heartbeat, b.firmware_version,
             e.name as establishment_name,
             (SELECT COUNT(*) FROM device_reboots dr
              WHERE dr.mac_address = b.mac_address
              AND dr.timestamp >= datetime('now', '-1 day')) as reboots_24h,
             (SELECT COUNT(*) FROM device_reboots dr2
              WHERE dr2.mac_address = b.mac_address) as reboots_total
      FROM boards b
      LEFT JOIN establishments e ON b.establishment_id = e.id
      ORDER BY e.name, b.mac_address
    `).all() as any[];

    res.json(boards);
  } catch (error) {
    console.error('Error en GET reboots list:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * GET /api/esp32/reboots/:mac_address
 * Historial de reinicios de un dispositivo. Query: period=24h|7d (default: 24h)
 */
router.get('/reboots/:mac_address', (req: Request, res: Response) => {
  try {
    const { mac_address } = req.params;
    const period = (req.query.period as string) || '24h';
    const macStd = standardizeMac(mac_address);

    const board = db.prepare(`
      SELECT b.*, e.name as establishment_name
      FROM boards b
      LEFT JOIN establishments e ON b.establishment_id = e.id
      WHERE b.mac_address = ?
    `).get(macStd) as any;

    if (!board) {
      return res.status(404).json({ error: 'Dispositivo no registrado' });
    }

    const intervalMap: Record<string, string> = {
      '24h': '-1 day',
      '7d':  '-7 days',
    };
    const interval = intervalMap[period] || '-1 day';

    const reboots = db.prepare(`
      SELECT id, mac_address, reason, timestamp
      FROM device_reboots
      WHERE mac_address = ? AND timestamp >= datetime('now', ?)
      ORDER BY timestamp DESC
    `).all(macStd, interval) as any[];

    res.json({ board, period, total: reboots.length, reboots });
  } catch (error) {
    console.error('Error en GET reboots:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * GET /api/esp32/action-logs
 * Logs de acciones ON/OFF de aireadores por establecimiento.
 * Query: establishment_id (requerido), period=24h|7d|30d (default: 24h), position (opcional)
 */
router.get('/action-logs', (req: Request, res: Response) => {
  try {
    const { establishment_id, period, position } = req.query;

    if (!establishment_id) {
      return res.status(400).json({ error: 'establishment_id es requerido' });
    }

    const intervalMap: Record<string, string> = {
      '24h': '-1 day',
      '7d':  '-7 days',
      '30d': '-30 days',
    };
    const interval = intervalMap[period as string] || '-1 day';

    let query = `
      SELECT
        dal.id,
        dal.mac_address,
        dal.action,
        dal.position,
        dal.result,
        dal.message,
        dal.timestamp,
        e.name as establishment_name,
        s.name as silo_name
      FROM device_action_logs dal
      JOIN boards b ON dal.mac_address = b.mac_address
      JOIN establishments e ON b.establishment_id = e.id
      LEFT JOIN silos s ON s.establishment_id = e.id AND s.aerator_position = dal.position
      WHERE b.establishment_id = ?
        AND dal.timestamp >= datetime('now', ?)
    `;

    const params: any[] = [parseInt(establishment_id as string), interval];

    if (position !== undefined) {
      query += ' AND dal.position = ?';
      params.push(parseInt(position as string));
    }

    query += ' ORDER BY dal.timestamp DESC LIMIT 500';

    const logs = db.prepare(query).all(...params) as any[];

    res.json({ period: period || '24h', total: logs.length, logs });
  } catch (error) {
    console.error('Error en GET action-logs:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Endpoint simple para verificar conectividad
router.get('/ping', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
