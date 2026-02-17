import express from 'express';
import { db } from '../database/db';
import { authenticateToken, requireSuperAdmin } from '../middleware/auth';
import { Silo } from '../types';

const router = express.Router();

// Todas las rutas requieren autenticación y permisos de super_admin
router.use(authenticateToken);
router.use(requireSuperAdmin);

/**
 * GET /api/silos-management
 * Obtener todos los silos con información del establecimiento
 */
router.get('/', (req, res) => {
  try {
    const silos = db.prepare(`
      SELECT 
        s.*,
        e.name as establishment_name
      FROM silos s
      LEFT JOIN establishments e ON s.establishment_id = e.id
      ORDER BY e.name, s.aerator_position
    `).all();

    res.json(silos);
  } catch (error: any) {
    console.error('Error al obtener silos:', error);
    res.status(500).json({ error: 'Error al obtener silos' });
  }
});

/**
 * GET /api/silos-management/:id
 * Obtener un silo por ID
 */
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    const silo = db.prepare(`
      SELECT 
        s.*,
        e.name as establishment_name
      FROM silos s
      LEFT JOIN establishments e ON s.establishment_id = e.id
      WHERE s.id = ?
    `).get(id);

    if (!silo) {
      return res.status(404).json({ error: 'Silo no encontrado' });
    }

    res.json(silo);
  } catch (error: any) {
    console.error('Error al obtener silo:', error);
    res.status(500).json({ error: 'Error al obtener silo' });
  }
});

/**
 * GET /api/silos-management/establishment/:establishmentId
 * Obtener todos los silos de un establecimiento
 */
router.get('/establishment/:establishmentId', (req, res) => {
  try {
    const { establishmentId } = req.params;
    
    const silos = db.prepare(`
      SELECT * FROM silos 
      WHERE establishment_id = ?
      ORDER BY aerator_position
    `).all(establishmentId);

    res.json(silos);
  } catch (error: any) {
    console.error('Error al obtener silos del establecimiento:', error);
    res.status(500).json({ error: 'Error al obtener silos' });
  }
});

/**
 * GET /api/silos-management/establishment/:establishmentId/available-positions
 * Obtener posiciones de aireador disponibles para un establecimiento
 * Query param opcional: excludeSiloId - ID del silo a excluir (útil al editar)
 */
router.get('/establishment/:establishmentId/available-positions', (req, res) => {
  try {
    const { establishmentId } = req.params;
    const { excludeSiloId } = req.query;
    
    // Obtener posiciones ocupadas, excluyendo opcionalmente un silo específico
    let query = `
      SELECT aerator_position FROM silos 
      WHERE establishment_id = ?
    `;
    const params: any[] = [establishmentId];
    
    if (excludeSiloId) {
      query += ` AND id != ?`;
      params.push(excludeSiloId);
    }
    
    const occupiedPositions = db.prepare(query)
      .all(...params)
      .map((row: any) => row.aerator_position);

    // Generar todas las posiciones (1-8) y filtrar las disponibles
    const allPositions = Array.from({ length: 8 }, (_, i) => i + 1);
    const availablePositions = allPositions.filter(pos => !occupiedPositions.includes(pos));

    res.json({ available_positions: availablePositions });
  } catch (error: any) {
    console.error('Error al obtener posiciones disponibles:', error);
    res.status(500).json({ error: 'Error al obtener posiciones disponibles' });
  }
});

/**
 * POST /api/silos-management
 * Crear un nuevo silo
 */
router.post('/', (req, res) => {
  try {
    const {
      name,
      establishment_id,
      aerator_position,
      min_temperature,
      max_temperature,
      min_humidity,
      max_humidity,
      peak_hours_shutdown,
      air_start_hour,
      air_end_hour,
      use_sun_schedule
    } = req.body;

    // Validaciones
    if (!name || !establishment_id || aerator_position === undefined) {
      return res.status(400).json({ 
        error: 'El nombre, establecimiento y posición del aireador son requeridos' 
      });
    }

    // Validar rangos de temperatura
    if (min_temperature >= max_temperature) {
      return res.status(400).json({ 
        error: 'La temperatura mínima debe ser menor que la máxima' 
      });
    }

    // Validar rangos de humedad
    if (min_humidity >= max_humidity) {
      return res.status(400).json({ 
        error: 'La humedad mínima debe ser menor que la máxima' 
      });
    }

    // Validar posición del aireador (1-8)
    if (aerator_position < 1 || aerator_position > 8) {
      return res.status(400).json({ 
        error: 'La posición del aireador debe estar entre 1 y 8' 
      });
    }

    // Validar horas (0-23)
    if (air_start_hour < 0 || air_start_hour > 23 || air_end_hour < 0 || air_end_hour > 23) {
      return res.status(400).json({ 
        error: 'Las horas deben estar entre 0 y 23' 
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

    // Verificar que la posición no esté ocupada
    const existingPosition = db.prepare(
      'SELECT id FROM silos WHERE establishment_id = ? AND aerator_position = ?'
    ).get(establishment_id, aerator_position);
    
    if (existingPosition) {
      return res.status(400).json({ 
        error: 'La posición del aireador ya está ocupada en este establecimiento' 
      });
    }

    // Crear el nuevo silo
    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO silos (
        name,
        establishment_id,
        aerator_position,
        min_temperature,
        max_temperature,
        min_humidity,
        max_humidity,
        peak_hours_shutdown,
        air_start_hour,
        air_end_hour,
        use_sun_schedule,
        manual_mode,
        modified,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'auto', 0, ?, ?)
    `).run(
      name,
      establishment_id,
      aerator_position,
      min_temperature || 10.0,
      max_temperature || 25.0,
      min_humidity || 40.0,
      max_humidity || 70.0,
      peak_hours_shutdown ? 1 : 0,
      air_start_hour || 22,
      air_end_hour || 6,
      use_sun_schedule ? 1 : 0,
      now,
      now
    );

    const newSilo = db.prepare('SELECT * FROM silos WHERE id = ?')
      .get(result.lastInsertRowid) as Silo;

    res.status(201).json({ 
      message: 'Silo creado exitosamente',
      silo: newSilo 
    });
  } catch (error: any) {
    console.error('Error al crear silo:', error);
    res.status(500).json({ error: 'Error al crear silo' });
  }
});

/**
 * PUT /api/silos-management/:id
 * Actualizar un silo
 */
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    console.log('=== PUT /api/silos-management/:id ===');
    console.log('ID:', id);
    console.log('Body recibido:', JSON.stringify(req.body, null, 2));
    
    const {
      name,
      establishment_id,
      aerator_position,
      min_temperature,
      max_temperature,
      min_humidity,
      max_humidity,
      peak_hours_shutdown,
      air_start_hour,
      air_end_hour,
      use_sun_schedule,
      manual_mode
    } = req.body;

    // Verificar que el silo existe
    const existingSilo = db.prepare('SELECT * FROM silos WHERE id = ?').get(id);
    if (!existingSilo) {
      console.log('❌ Silo no encontrado');
      return res.status(404).json({ error: 'Silo no encontrado' });
    }
    console.log('✓ Silo existe');

    // Validaciones
    if (!name || !establishment_id || aerator_position === undefined) {
      console.log('❌ Validación falló:', { name, establishment_id, aerator_position });
      return res.status(400).json({ 
        error: 'El nombre, establecimiento y posición del aireador son requeridos' 
      });
    }
    console.log('✓ Campos requeridos presentes');

    // Validar rangos
    if (min_temperature >= max_temperature) {
      return res.status(400).json({ 
        error: 'La temperatura mínima debe ser menor que la máxima' 
      });
    }

    if (min_humidity >= max_humidity) {
      return res.status(400).json({ 
        error: 'La humedad mínima debe ser menor que la máxima' 
      });
    }

    if (aerator_position < 1 || aerator_position > 8) {
      return res.status(400).json({ 
        error: 'La posición del aireador debe estar entre 1 y 8' 
      });
    }

    if (air_start_hour < 0 || air_start_hour > 23 || air_end_hour < 0 || air_end_hour > 23) {
      return res.status(400).json({ 
        error: 'Las horas deben estar entre 0 y 23' 
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

    // Verificar que la posición no esté ocupada por otro silo
    const duplicatePosition = db.prepare(
      'SELECT id FROM silos WHERE establishment_id = ? AND aerator_position = ? AND id != ?'
    ).get(establishment_id, aerator_position, id);
    
    if (duplicatePosition) {
      return res.status(400).json({ 
        error: 'La posición del aireador ya está ocupada por otro silo' 
      });
    }

    // Validar manual_mode
    if (manual_mode && !['auto', 'on', 'off', 'intelligent'].includes(manual_mode)) {
      return res.status(400).json({ 
        error: 'Modo manual inválido. Use: auto, on, off, o intelligent' 
      });
    }

    // Actualizar el silo
    console.log('✓ Todas las validaciones pasaron, actualizando...');
    const now = new Date().toISOString();
    const result = db.prepare(`
      UPDATE silos 
      SET name = ?,
          establishment_id = ?,
          aerator_position = ?,
          min_temperature = ?,
          max_temperature = ?,
          min_humidity = ?,
          max_humidity = ?,
          peak_hours_shutdown = ?,
          air_start_hour = ?,
          air_end_hour = ?,
          use_sun_schedule = ?,
          manual_mode = ?,
          modified = 1,
          updated_at = ?
      WHERE id = ?
    `).run(
      name,
      establishment_id,
      aerator_position,
      min_temperature,
      max_temperature,
      min_humidity,
      max_humidity,
      peak_hours_shutdown ? 1 : 0,
      air_start_hour,
      air_end_hour,
      use_sun_schedule ? 1 : 0,
      manual_mode || 'auto',
      now,
      id
    );

    console.log('✓ UPDATE ejecutado, filas afectadas:', result.changes);

    const updatedSilo = db.prepare('SELECT * FROM silos WHERE id = ?')
      .get(id) as Silo;

    console.log('✓ Silo actualizado exitosamente');
    res.json({ 
      message: 'Silo actualizado exitosamente',
      silo: updatedSilo 
    });
  } catch (error: any) {
    console.error('Error al actualizar silo:', error);
    res.status(500).json({ error: 'Error al actualizar silo' });
  }
});

/**
 * DELETE /api/silos-management/:id
 * Eliminar un silo
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que el silo existe
    const silo = db.prepare('SELECT * FROM silos WHERE id = ?').get(id);
    if (!silo) {
      return res.status(404).json({ error: 'Silo no encontrado' });
    }

    // Eliminar el silo
    db.prepare('DELETE FROM silos WHERE id = ?').run(id);

    res.json({ message: 'Silo eliminado exitosamente' });
  } catch (error: any) {
    console.error('Error al eliminar silo:', error);
    res.status(500).json({ error: 'Error al eliminar silo' });
  }
});

/**
 * GET /api/silos-management/:id/intelligent-config
 * Obtener configuración inteligente de un silo
 */
router.get('/:id/intelligent-config', (req, res) => {
  try {
    const { id } = req.params;
    const config = db.prepare('SELECT * FROM intelligent_aeration_configs WHERE silo_id = ?').get(id);
    res.json(config || null);
  } catch (error: any) {
    console.error('Error al obtener configuración inteligente:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * PUT /api/silos-management/:id/intelligent-config
 * Actualizar configuración inteligente de un silo
 */
router.put('/:id/intelligent-config', (req, res) => {
  try {
    const { id } = req.params;
    const {
      grain_type,
      target_grain_moisture,
      target_temp,
      achieve_temperature,
      achieve_humidity,
      operation_type,
      anti_condensation,
      delta_temp_min,
      delta_temp_hyst,
      delta_emc_min,
      active
    } = req.body;

    const existing = db.prepare('SELECT id FROM intelligent_aeration_configs WHERE silo_id = ?').get(id);

    if (existing) {
      db.prepare(`
        UPDATE intelligent_aeration_configs SET
          grain_type = ?,
          target_grain_moisture = ?,
          target_temp = ?,
          achieve_temperature = ?,
          achieve_humidity = ?,
          operation_type = ?,
          anti_condensation = ?,
          delta_temp_min = ?,
          delta_temp_hyst = ?,
          delta_emc_min = ?,
          active = ?,
          updated_at = datetime('now')
        WHERE silo_id = ?
      `).run(
        grain_type,
        target_grain_moisture,
        target_temp,
        achieve_temperature ? 1 : 0,
        achieve_humidity ? 1 : 0,
        operation_type || 'dry',
        anti_condensation ? 1 : 0,
        delta_temp_min,
        delta_temp_hyst,
        delta_emc_min,
        active ? 1 : 0,
        id
      );
    } else {
      db.prepare(`
        INSERT INTO intelligent_aeration_configs (
          silo_id, grain_type, target_grain_moisture, target_temp,
          achieve_temperature, achieve_humidity, operation_type,
          anti_condensation, delta_temp_min, delta_temp_hyst,
          delta_emc_min, active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        grain_type,
        target_grain_moisture,
        target_temp,
        achieve_temperature ? 1 : 0,
        achieve_humidity ? 1 : 0,
        operation_type || 'dry',
        anti_condensation ? 1 : 0,
        delta_temp_min,
        delta_temp_hyst,
        delta_emc_min,
        active ? 1 : 0
      );
    }

    // Marcar silo como modificado para el ESP32
    db.prepare('UPDATE silos SET modified = 1 WHERE id = ?').run(id);

    res.json({ message: 'Configuración inteligente actualizada exitosamente' });
  } catch (error: any) {
    console.error('Error al actualizar configuración inteligente:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
