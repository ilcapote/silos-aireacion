import Database from 'better-sqlite3';
import path from 'path';
import bcrypt from 'bcryptjs';

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../database.sqlite');
export const db = new Database(dbPath);

// Habilitar foreign keys
db.pragma('foreign_keys = ON');

export function initDatabase() {
  // Tabla de usuarios
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      require_password_change INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabla de establecimientos
  db.exec(`
    CREATE TABLE IF NOT EXISTS establishments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      owner TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      city TEXT,
      max_operating_current REAL,
      current_sensor_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Asegurar que la columna 'city' existe (para bases de datos ya creadas)
  try {
    db.prepare("ALTER TABLE establishments ADD COLUMN city TEXT").run();
  } catch (e) {
    // La columna ya existe o hubo otro error manejable
  }

  // Tabla de dispositivos ESP32 (Boards)
  db.exec(`
    CREATE TABLE IF NOT EXISTS boards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mac_address TEXT NOT NULL UNIQUE,
      establishment_id INTEGER NOT NULL,
      registration_date TEXT NOT NULL DEFAULT (datetime('now')),
      firmware_version TEXT,
      last_heartbeat TEXT,
      status TEXT DEFAULT 'offline',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (establishment_id) REFERENCES establishments(id) ON DELETE CASCADE
    )
  `);

  // Tabla de silos
  db.exec(`
    CREATE TABLE IF NOT EXISTS silos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      establishment_id INTEGER NOT NULL,
      aerator_position INTEGER NOT NULL,
      min_temperature REAL NOT NULL DEFAULT 10.0,
      max_temperature REAL NOT NULL DEFAULT 25.0,
      min_humidity REAL NOT NULL DEFAULT 40.0,
      max_humidity REAL NOT NULL DEFAULT 70.0,
      peak_hours_shutdown INTEGER DEFAULT 0,
      air_start_hour INTEGER DEFAULT 22,
      air_end_hour INTEGER DEFAULT 6,
      use_sun_schedule INTEGER DEFAULT 0,
      manual_mode TEXT DEFAULT 'auto',
      modified INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (establishment_id) REFERENCES establishments(id) ON DELETE CASCADE,
      UNIQUE(establishment_id, aerator_position)
    )
  `);

  // Tabla de logs de aireación
  db.exec(`
    CREATE TABLE IF NOT EXISTS aeration_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      silo_id INTEGER NOT NULL,
      runtime_hours REAL NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (silo_id) REFERENCES silos(id) ON DELETE CASCADE
    )
  `);

  // Tabla de sensores de temperatura
  db.exec(`
    CREATE TABLE IF NOT EXISTS temperature_sensors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      serial_number TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Tabla de barras de sensores
  db.exec(`
    CREATE TABLE IF NOT EXISTS sensor_bars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      establishment_id INTEGER,
      silo_id INTEGER UNIQUE,
      sensor1_id INTEGER UNIQUE,
      sensor2_id INTEGER UNIQUE,
      sensor3_id INTEGER UNIQUE,
      sensor4_id INTEGER UNIQUE,
      sensor5_id INTEGER UNIQUE,
      sensor6_id INTEGER UNIQUE,
      sensor7_id INTEGER UNIQUE,
      sensor8_id INTEGER UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (establishment_id) REFERENCES establishments(id) ON DELETE SET NULL,
      FOREIGN KEY (silo_id) REFERENCES silos(id) ON DELETE SET NULL,
      FOREIGN KEY (sensor1_id) REFERENCES temperature_sensors(id) ON DELETE SET NULL,
      FOREIGN KEY (sensor2_id) REFERENCES temperature_sensors(id) ON DELETE SET NULL,
      FOREIGN KEY (sensor3_id) REFERENCES temperature_sensors(id) ON DELETE SET NULL,
      FOREIGN KEY (sensor4_id) REFERENCES temperature_sensors(id) ON DELETE SET NULL,
      FOREIGN KEY (sensor5_id) REFERENCES temperature_sensors(id) ON DELETE SET NULL,
      FOREIGN KEY (sensor6_id) REFERENCES temperature_sensors(id) ON DELETE SET NULL,
      FOREIGN KEY (sensor7_id) REFERENCES temperature_sensors(id) ON DELETE SET NULL,
      FOREIGN KEY (sensor8_id) REFERENCES temperature_sensors(id) ON DELETE SET NULL
    )
  `);

  // Tabla de lecturas de temperatura
  db.exec(`
    CREATE TABLE IF NOT EXISTS temperature_readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sensor_id INTEGER NOT NULL,
      bar_id INTEGER,
      silo_id INTEGER,
      temperature REAL NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      raw_payload TEXT,
      FOREIGN KEY (sensor_id) REFERENCES temperature_sensors(id) ON DELETE CASCADE,
      FOREIGN KEY (bar_id) REFERENCES sensor_bars(id) ON DELETE SET NULL,
      FOREIGN KEY (silo_id) REFERENCES silos(id) ON DELETE SET NULL
    )
  `);

  // Tabla de configuración de modo inteligente
  db.exec(`
    CREATE TABLE IF NOT EXISTS intelligent_aeration_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      silo_id INTEGER UNIQUE NOT NULL,
      grain_type TEXT NOT NULL DEFAULT 'maiz',
      target_grain_moisture REAL NOT NULL DEFAULT 14.0,
      target_temp REAL,
      achieve_temperature INTEGER DEFAULT 0,
      achieve_humidity INTEGER DEFAULT 0,
      operation_type TEXT NOT NULL DEFAULT 'dry', -- 'dry' o 'humidify'
      anti_condensation INTEGER DEFAULT 1,
      delta_temp_min REAL NOT NULL DEFAULT 5.0,
      delta_temp_hyst REAL NOT NULL DEFAULT 2.0,
      delta_emc_min REAL NOT NULL DEFAULT 1.0,
      active INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (silo_id) REFERENCES silos(id) ON DELETE CASCADE
    )
  `);

  // Tabla de reinicios de dispositivos ESP32
  db.exec(`
    CREATE TABLE IF NOT EXISTS device_reboots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mac_address TEXT NOT NULL,
      reason TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (mac_address) REFERENCES boards(mac_address) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_reboots_mac ON device_reboots(mac_address);
    CREATE INDEX IF NOT EXISTS idx_reboots_timestamp ON device_reboots(timestamp DESC);
  `);

  // Limpiar reboots con más de 1 mes de antigüedad
  db.prepare(`
    DELETE FROM device_reboots WHERE timestamp < datetime('now', '-1 month')
  `).run();

  // Tabla de heartbeats de dispositivos ESP32
  db.exec(`
    CREATE TABLE IF NOT EXISTS device_heartbeats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mac_address TEXT NOT NULL,
      firmware_version TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (mac_address) REFERENCES boards(mac_address) ON DELETE CASCADE
    )
  `);

  // Índices para mejorar consultas de heartbeats
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_heartbeats_mac ON device_heartbeats(mac_address);
    CREATE INDEX IF NOT EXISTS idx_heartbeats_timestamp ON device_heartbeats(timestamp DESC);
  `);

  // Limpiar heartbeats con más de 1 mes de antigüedad
  db.prepare(`
    DELETE FROM device_heartbeats WHERE timestamp < datetime('now', '-1 month')
  `).run();

  // Índices para mejorar consultas de lecturas
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_temp_readings_sensor ON temperature_readings(sensor_id);
    CREATE INDEX IF NOT EXISTS idx_temp_readings_timestamp ON temperature_readings(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_temp_readings_silo ON temperature_readings(silo_id);
  `);

  // Crear super_admin si no existe
  const existingSuperAdmin = db.prepare('SELECT id FROM users WHERE username = ?').get('super_admin');
  
  if (!existingSuperAdmin) {
    const hashedPassword = bcrypt.hashSync('nopormuchomadrugarsevenlasvacasencamison', 10);
    db.prepare(`
      INSERT INTO users (username, password, role, require_password_change)
      VALUES (?, ?, ?, ?)
    `).run('super_admin', hashedPassword, 'super_admin', 0);
    
    console.log('✅ Super admin creado exitosamente');
  }

  console.log('✅ Base de datos inicializada');
}
