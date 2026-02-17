import { db } from '../database/db';

console.log('🌱 Insertando datos de prueba...');

try {
  // Insertar establecimiento de prueba
  const establishment = db.prepare(`
    INSERT OR IGNORE INTO establishments (name, owner, latitude, longitude)
    VALUES (?, ?, ?, ?)
  `).run('Establecimiento Demo', 'Juan Pérez', -34.6037, -58.3816);

  const establishmentId = establishment.lastInsertRowid || 1;
  console.log(`✅ Establecimiento creado con ID: ${establishmentId}`);

  // Verificar si ya existen silos
  const existingSilos = db.prepare('SELECT COUNT(*) as count FROM silos').get() as { count: number };
  
  if (existingSilos.count === 0) {
    // Insertar silos de prueba
    const silosData = [
      { name: 'SILO 1', position: 1, minTemp: 10, maxTemp: 25, minHum: 40, maxHum: 70 },
      { name: 'SILO 2', position: 2, minTemp: 12, maxTemp: 24, minHum: 45, maxHum: 65 },
      { name: 'SILO 3', position: 3, minTemp: 11, maxTemp: 26, minHum: 42, maxHum: 68 },
      { name: 'SILO 4', position: 4, minTemp: 10, maxTemp: 25, minHum: 40, maxHum: 70 },
    ];

    const insertSilo = db.prepare(`
      INSERT INTO silos (
        name, establishment_id, aerator_position, 
        min_temperature, max_temperature, min_humidity, max_humidity,
        manual_mode
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const silo of silosData) {
      insertSilo.run(
        silo.name,
        establishmentId,
        silo.position,
        silo.minTemp,
        silo.maxTemp,
        silo.minHum,
        silo.maxHum,
        'auto'
      );
      console.log(`✅ Silo creado: ${silo.name}`);
    }

    console.log('✅ Datos de prueba insertados exitosamente');
  } else {
    console.log(`ℹ️  Ya existen ${existingSilos.count} silos en la base de datos`);
  }

} catch (error) {
  console.error('❌ Error al insertar datos:', error);
  process.exit(1);
}

console.log('🎉 Proceso completado');
