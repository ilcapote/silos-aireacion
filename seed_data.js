const sqlite3 = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'backend', 'database.sqlite');
const db = new sqlite3(dbPath);

console.log('--- Iniciando carga de datos de temperatura de prueba ---');

// 1. Obtener todos los sensores registrados
const sensors = db.prepare('SELECT id, serial_number FROM temperature_sensors').all();

if (sensors.length === 0) {
  console.log('No hay sensores registrados. Por favor, crea algunos sensores primero.');
  process.exit(1);
}

console.log(`Encontrados ${sensors.length} sensores.`);

// 2. Para cada sensor, obtener su barra y silo asociados (si existen)
const sensorMappings = sensors.map(s => {
  const mapping = db.prepare(`
    SELECT id as bar_id, silo_id FROM sensor_bars 
    WHERE sensor1_id = ? OR sensor2_id = ? OR sensor3_id = ? OR sensor4_id = ?
       OR sensor5_id = ? OR sensor6_id = ? OR sensor7_id = ? OR sensor8_id = ?
  `).get(s.id, s.id, s.id, s.id, s.id, s.id, s.id, s.id);
  
  return {
    sensor_id: s.id,
    serial_number: s.serial_number,
    bar_id: mapping ? mapping.bar_id : null,
    silo_id: mapping ? mapping.silo_id : null
  };
});

// 3. Generar datos para los últimos 7 días, 2 veces al día (09:00 y 21:00)
const now = new Date();
const insertStmt = db.prepare(`
  INSERT INTO temperature_readings (sensor_id, bar_id, silo_id, temperature, timestamp)
  VALUES (?, ?, ?, ?, ?)
`);

// Base de temperatura (variación suave)
let baseTemp = 22.5;

db.transaction(() => {
  for (let d = 7; d >= 0; d--) {
    const currentDate = new Date(now);
    currentDate.setDate(now.getDate() - d);
    
    // Variación diaria de la base
    baseTemp += (Math.random() - 0.5) * 0.5;

    // Dos lecturas al día
    [9, 21].forEach(hour => {
      const readingTime = new Date(currentDate);
      readingTime.setHours(hour, 0, 0, 0);
      
      sensorMappings.forEach(m => {
        // Cada sensor tiene una pequeña desviación de la base
        const sensorDeviation = (Math.random() - 0.5) * 0.2;
        // La noche es un poco más fresca
        const dayNightDiff = (hour === 21) ? -1.2 : 0;
        
        const finalTemp = parseFloat((baseTemp + sensorDeviation + dayNightDiff).toFixed(2));
        
        insertStmt.run(
          m.sensor_id,
          m.bar_id,
          m.silo_id,
          finalTemp,
          readingTime.toISOString()
        );
      });
    });
  }
})();

console.log('--- Carga de datos completada exitosamente ---');
console.log(`Se han insertado lecturas para ${sensors.length} sensores durante los últimos 8 días.`);
db.close();
