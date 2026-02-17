import { db } from '../database/db';

console.log('Creando datos de prueba...');

try {
  // 1. Verificar si ya existe el establecimiento
  const existingEstablishment = db.prepare('SELECT id FROM establishments WHERE name = ?').get('Establecimiento Demo') as any;
  
  let establishmentId: number;
  
  if (existingEstablishment) {
    console.log('✓ Establecimiento ya existe, usando ID:', existingEstablishment.id);
    establishmentId = existingEstablishment.id;
  } else {
    // Crear establecimiento de prueba
    const estResult = db.prepare(`
      INSERT INTO establishments (name, owner, latitude, longitude, max_operating_current)
      VALUES (?, ?, ?, ?, ?)
    `).run('Establecimiento Demo', 'Juan Pérez', -34.6037, -58.3816, 50.0);
    establishmentId = estResult.lastInsertRowid as number;
    console.log('✓ Establecimiento creado con ID:', establishmentId);
  }

  // 2. Verificar si ya existe el dispositivo ESP32
  const existingBoard = db.prepare('SELECT id FROM boards WHERE mac_address = ?').get('AA:BB:CC:DD:EE:FF') as any;
  
  if (!existingBoard) {
    db.prepare(`
      INSERT INTO boards (mac_address, establishment_id, firmware_version)
      VALUES (?, ?, ?)
    `).run('AA:BB:CC:DD:EE:FF', establishmentId, '1.0.0');
    console.log('✓ Dispositivo ESP32 creado');
  } else {
    console.log('✓ Dispositivo ESP32 ya existe');
  }

  // Crear silos de prueba con rangos amplios para permitir operación durante el día
  const silos = [
    { name: 'Silo 1', position: 1, min_temp: 5, max_temp: 35, min_hum: 30, max_hum: 80, start: 0, end: 23 },
    { name: 'Silo 2', position: 2, min_temp: 5, max_temp: 35, min_hum: 30, max_hum: 80, start: 0, end: 23 },
    { name: 'Silo 3', position: 3, min_temp: 5, max_temp: 35, min_hum: 30, max_hum: 80, start: 0, end: 23 }
  ];

  // 3. Limpiar silos existentes del establecimiento y recrearlos
  db.prepare('DELETE FROM silos WHERE establishment_id = ?').run(establishmentId);
  console.log('✓ Silos anteriores eliminados');
  
  for (const silo of silos) {
    db.prepare(`
      INSERT INTO silos (name, establishment_id, aerator_position, min_temperature, max_temperature, min_humidity, max_humidity, peak_hours_shutdown, air_start_hour, air_end_hour, use_sun_schedule, manual_mode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(silo.name, establishmentId, silo.position, silo.min_temp, silo.max_temp, silo.min_hum, silo.max_hum, 0, silo.start, silo.end, 0, 'auto');
  }
  console.log(`✅ ${silos.length} silos creados`);

  // Sensores omitidos por ahora

  console.log('\n✅ Datos de prueba creados exitosamente');
  console.log('\nCredenciales:');
  console.log('  Usuario: super_admin');
  console.log('  Contraseña: nopormuchomadrugarsevenlasvacasencamison');
  console.log('\nMAC del ESP32 de prueba: AA:BB:CC:DD:EE:FF');
  
} catch (error) {
  console.error('❌ Error al crear datos de prueba:', error);
  process.exit(1);
}
