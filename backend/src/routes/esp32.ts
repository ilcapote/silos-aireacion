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

// Endpoint simple para verificar conectividad
router.get('/ping', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
