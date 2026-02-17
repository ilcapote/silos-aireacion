import express from 'express';
import { db } from '../database/db';
import { authenticateToken, requireSuperAdmin } from '../middleware/auth';
import { Board } from '../types';

const router = express.Router();

// Todas las rutas requieren autenticación y permisos de super_admin
router.use(authenticateToken);
router.use(requireSuperAdmin);

/**
 * GET /api/boards
 * Obtener todos los dispositivos ESP32
 */
router.get('/', (req, res) => {
  try {
    const boards = db.prepare(`
      SELECT 
        b.*,
        e.name as establishment_name
      FROM boards b
      LEFT JOIN establishments e ON b.establishment_id = e.id
      ORDER BY b.created_at DESC
    `).all();

    res.json(boards);
  } catch (error: any) {
    console.error('Error al obtener boards:', error);
    res.status(500).json({ error: 'Error al obtener dispositivos' });
  }
});

/**
 * GET /api/boards/:id
 * Obtener un dispositivo ESP32 por ID
 */
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    const board = db.prepare(`
      SELECT 
        b.*,
        e.name as establishment_name
      FROM boards b
      LEFT JOIN establishments e ON b.establishment_id = e.id
      WHERE b.id = ?
    `).get(id);

    if (!board) {
      return res.status(404).json({ error: 'Dispositivo no encontrado' });
    }

    res.json(board);
  } catch (error: any) {
    console.error('Error al obtener board:', error);
    res.status(500).json({ error: 'Error al obtener dispositivo' });
  }
});

/**
 * GET /api/boards/establishment/:establishmentId
 * Obtener todos los dispositivos de un establecimiento
 */
router.get('/establishment/:establishmentId', (req, res) => {
  try {
    const { establishmentId } = req.params;
    
    const boards = db.prepare(`
      SELECT * FROM boards 
      WHERE establishment_id = ?
      ORDER BY created_at DESC
    `).all(establishmentId);

    res.json(boards);
  } catch (error: any) {
    console.error('Error al obtener boards del establecimiento:', error);
    res.status(500).json({ error: 'Error al obtener dispositivos' });
  }
});

/**
 * POST /api/boards
 * Crear un nuevo dispositivo ESP32
 */
router.post('/', (req, res) => {
  try {
    const { mac_address, establishment_id, firmware_version } = req.body;

    // Validaciones
    if (!mac_address || !establishment_id) {
      return res.status(400).json({ 
        error: 'La dirección MAC y el establecimiento son requeridos' 
      });
    }

    // Validar formato de MAC address (XX:XX:XX:XX:XX:XX)
    const macRegex = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;
    if (!macRegex.test(mac_address)) {
      return res.status(400).json({ 
        error: 'Formato de dirección MAC inválido. Use formato XX:XX:XX:XX:XX:XX' 
      });
    }

    // Normalizar MAC address a mayúsculas
    const normalizedMac = mac_address.toUpperCase();

    // Verificar si la MAC ya existe
    const existingBoard = db.prepare('SELECT id FROM boards WHERE mac_address = ?')
      .get(normalizedMac);
    
    if (existingBoard) {
      return res.status(400).json({ 
        error: 'Esta dirección MAC ya está registrada' 
      });
    }

    // Verificar que el establecimiento existe
    const establishment = db.prepare('SELECT id FROM establishments WHERE id = ?')
      .get(establishment_id);
    
    if (!establishment) {
      return res.status(400).json({ 
        error: 'El establecimiento especificado no existe' 
      });
    }

    // Crear el nuevo board
    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO boards (
        mac_address, 
        establishment_id, 
        registration_date,
        firmware_version,
        status,
        created_at, 
        updated_at
      )
      VALUES (?, ?, ?, ?, 'offline', ?, ?)
    `).run(
      normalizedMac,
      establishment_id,
      now,
      firmware_version || null,
      now,
      now
    );

    const newBoard = db.prepare('SELECT * FROM boards WHERE id = ?')
      .get(result.lastInsertRowid) as Board;

    res.status(201).json({ 
      message: 'Dispositivo ESP32 registrado exitosamente',
      board: newBoard 
    });
  } catch (error: any) {
    console.error('Error al crear board:', error);
    res.status(500).json({ error: 'Error al crear dispositivo' });
  }
});

/**
 * PUT /api/boards/:id
 * Actualizar un dispositivo ESP32
 */
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { mac_address, establishment_id, firmware_version, status } = req.body;

    // Verificar que el board existe
    const existingBoard = db.prepare('SELECT * FROM boards WHERE id = ?').get(id);
    if (!existingBoard) {
      return res.status(404).json({ error: 'Dispositivo no encontrado' });
    }

    // Validaciones
    if (!mac_address || !establishment_id) {
      return res.status(400).json({ 
        error: 'La dirección MAC y el establecimiento son requeridos' 
      });
    }

    // Validar formato de MAC address
    const macRegex = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;
    if (!macRegex.test(mac_address)) {
      return res.status(400).json({ 
        error: 'Formato de dirección MAC inválido. Use formato XX:XX:XX:XX:XX:XX' 
      });
    }

    const normalizedMac = mac_address.toUpperCase();

    // Verificar si la MAC ya existe en otro board
    const duplicateBoard = db.prepare(
      'SELECT id FROM boards WHERE mac_address = ? AND id != ?'
    ).get(normalizedMac, id);
    
    if (duplicateBoard) {
      return res.status(400).json({ 
        error: 'Esta dirección MAC ya está registrada en otro dispositivo' 
      });
    }

    // Verificar que el establecimiento existe
    const establishment = db.prepare('SELECT id FROM establishments WHERE id = ?')
      .get(establishment_id);
    
    if (!establishment) {
      return res.status(400).json({ 
        error: 'El establecimiento especificado no existe' 
      });
    }

    // Validar status si se proporciona
    if (status && !['online', 'offline', 'warning'].includes(status)) {
      return res.status(400).json({ 
        error: 'Estado inválido. Use: online, offline, o warning' 
      });
    }

    // Actualizar el board
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE boards 
      SET mac_address = ?,
          establishment_id = ?,
          firmware_version = ?,
          status = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      normalizedMac,
      establishment_id,
      firmware_version || null,
      status || (existingBoard as any).status,
      now,
      id
    );

    const updatedBoard = db.prepare('SELECT * FROM boards WHERE id = ?')
      .get(id) as Board;

    res.json({ 
      message: 'Dispositivo actualizado exitosamente',
      board: updatedBoard 
    });
  } catch (error: any) {
    console.error('Error al actualizar board:', error);
    res.status(500).json({ error: 'Error al actualizar dispositivo' });
  }
});

/**
 * DELETE /api/boards/:id
 * Eliminar un dispositivo ESP32
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que el board existe
    const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(id);
    if (!board) {
      return res.status(404).json({ error: 'Dispositivo no encontrado' });
    }

    // Eliminar el board (las relaciones en cascada se encargarán del resto)
    db.prepare('DELETE FROM boards WHERE id = ?').run(id);

    res.json({ message: 'Dispositivo eliminado exitosamente' });
  } catch (error: any) {
    console.error('Error al eliminar board:', error);
    res.status(500).json({ error: 'Error al eliminar dispositivo' });
  }
});

/**
 * POST /api/boards/:id/heartbeat
 * Actualizar heartbeat de un dispositivo (usado por ESP32)
 */
router.post('/:id/heartbeat', (req, res) => {
  try {
    const { id } = req.params;
    const { firmware_version } = req.body;

    const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(id);
    if (!board) {
      return res.status(404).json({ error: 'Dispositivo no encontrado' });
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE boards 
      SET last_heartbeat = ?,
          status = 'online',
          firmware_version = COALESCE(?, firmware_version),
          updated_at = ?
      WHERE id = ?
    `).run(now, firmware_version || null, now, id);

    res.json({ message: 'Heartbeat actualizado' });
  } catch (error: any) {
    console.error('Error al actualizar heartbeat:', error);
    res.status(500).json({ error: 'Error al actualizar heartbeat' });
  }
});

export default router;
