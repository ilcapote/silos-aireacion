const Database = require('better-sqlite3');
const axios = require('axios');

const db = new Database('./database.sqlite');

async function getCityFromCoords(lat, lon) {
  try {
    console.log(`🔍 Buscando ubicación para coordenadas: ${lat}, ${lon}`);
    
    // Esperar 1 segundo para respetar rate limiting de Nominatim
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
      params: {
        format: 'json',
        lat: lat,
        lon: lon,
        zoom: 10,
        addressdetails: 1
      },
      headers: {
        'User-Agent': 'SilosControlSystem/1.0'
      },
      timeout: 5000
    });

    if (response.data && response.data.address) {
      const addr = response.data.address;
      
      // Buscar la ubicación más específica disponible
      const locality = addr.city || addr.town || addr.village || addr.municipality || addr.county || addr.state_district;
      const province = addr.state;
      
      // Si tenemos localidad y provincia, mostrar ambas
      if (locality && province && locality !== province) {
        const result = `${locality}, ${province}`;
        console.log(`✅ Ubicación encontrada: ${result}`);
        return result;
      }
      
      // Si solo tenemos localidad, mostrarla
      if (locality) {
        console.log(`✅ Ubicación encontrada: ${locality}`);
        return locality;
      }
      
      // Si solo tenemos provincia, mostrarla
      if (province) {
        console.log(`✅ Ubicación encontrada: ${province}`);
        return province;
      }
      
      console.log('⚠️  No se pudo determinar la ubicación');
      return 'Ubicación no identificada';
    }
    
    console.log('⚠️  No se pudo determinar la ubicación');
    return 'Ubicación no identificada';
  } catch (error) {
    console.error('❌ Error al obtener ubicación:', error.message);
    return 'Ubicación no identificada';
  }
}

async function updateEstablishmentsCities() {
  try {
    console.log('🚀 Iniciando actualización de ciudades para establecimientos...\n');
    
    // Obtener todos los establecimientos para actualizar con el nuevo formato
    const establishments = db.prepare("SELECT id, name, latitude, longitude, city FROM establishments").all();
    
    if (establishments.length === 0) {
      console.log('✅ Todos los establecimientos ya tienen ciudad asignada.');
      return;
    }
    
    console.log(`📋 Encontrados ${establishments.length} establecimientos sin ciudad:\n`);
    
    for (const est of establishments) {
      console.log(`\n📍 Procesando: ${est.name}`);
      console.log(`   Coordenadas: ${est.latitude}, ${est.longitude}`);
      
      const city = await getCityFromCoords(est.latitude, est.longitude);
      
      // Actualizar en la base de datos
      db.prepare('UPDATE establishments SET city = ? WHERE id = ?').run(city, est.id);
      
      console.log(`   ✅ Actualizado con ciudad: ${city}`);
    }
    
    console.log('\n\n🎉 ¡Actualización completada exitosamente!');
    console.log('\n📊 Resumen de establecimientos:');
    
    const allEstablishments = db.prepare('SELECT id, name, city FROM establishments').all();
    allEstablishments.forEach(est => {
      console.log(`   • ${est.name}: ${est.city || 'Sin ciudad'}`);
    });
    
  } catch (error) {
    console.error('❌ Error durante la actualización:', error);
  } finally {
    db.close();
  }
}

// Ejecutar
updateEstablishmentsCities();
