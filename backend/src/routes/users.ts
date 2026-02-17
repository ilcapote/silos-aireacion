import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../database/db';
import { User } from '../types';
import { authenticateToken, requireSuperAdmin } from '../middleware/auth';

const router = Router();

// Todas las rutas requieren autenticación y permisos de super_admin
router.use(authenticateToken);
router.use(requireSuperAdmin);

// Listar todos los usuarios
router.get('/', (req: Request, res: Response) => {
  try {
    const users = db.prepare(`
      SELECT id, username, role, require_password_change, created_at, updated_at 
      FROM users
      ORDER BY created_at DESC
    `).all();

    res.json(users);
  } catch (error) {
    console.error('Error al listar usuarios:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Crear nuevo usuario
router.post('/', (req: Request, res: Response) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Nombre de usuario requerido' });
    }

    // Verificar si el usuario ya existe
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);

    if (existingUser) {
      return res.status(409).json({ error: 'El usuario ya existe' });
    }

    // Crear usuario con contraseña por defecto
    const defaultPassword = '12345678';
    const hashedPassword = bcrypt.hashSync(defaultPassword, 10);

    const result = db.prepare(`
      INSERT INTO users (username, password, role, require_password_change)
      VALUES (?, ?, 'user', 1)
    `).run(username, hashedPassword);

    const newUser = db.prepare(`
      SELECT id, username, role, require_password_change, created_at, updated_at 
      FROM users WHERE id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({
      message: 'Usuario creado exitosamente',
      user: newUser,
      defaultPassword
    });
  } catch (error) {
    console.error('Error al crear usuario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Eliminar usuario
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // No permitir eliminar al super_admin
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(id) as User | undefined;

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    if (user.role === 'super_admin') {
      return res.status(403).json({ error: 'No se puede eliminar al super_admin' });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(id);

    res.json({ message: 'Usuario eliminado exitosamente' });
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Resetear contraseña de usuario
router.post('/:id/reset-password', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    if (user.role === 'super_admin') {
      return res.status(403).json({ error: 'No se puede resetear la contraseña del super_admin' });
    }

    const defaultPassword = '12345678';
    const hashedPassword = bcrypt.hashSync(defaultPassword, 10);

    db.prepare(`
      UPDATE users 
      SET password = ?, require_password_change = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(hashedPassword, id);

    res.json({ 
      message: 'Contraseña reseteada exitosamente',
      defaultPassword
    });
  } catch (error) {
    console.error('Error al resetear contraseña:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
