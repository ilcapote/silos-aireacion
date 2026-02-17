const axios = require('axios');

async function testNominatim(lat, lon, description) {
  try {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📍 Probando: ${description}`);
    console.log(`   Coordenadas: ${lat}, ${lon}`);
    console.log('='.repeat(80));
    
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

    if (response.data) {
      console.log('\n📦 RESPUESTA COMPLETA:');
      console.log(JSON.stringify(response.data, null, 2));
      
      console.log('\n🏷️  CAMPOS DE ADDRESS DISPONIBLES:');
      if (response.data.address) {
        Object.keys(response.data.address).forEach(key => {
          console.log(`   • ${key}: ${response.data.address[key]}`);
        });
      }
      
      console.log('\n🎯 JERARQUÍA DE UBICACIÓN (de más específico a más general):');
      const addr = response.data.address;
      const hierarchy = [
        { key: 'village', label: 'Villa/Pueblo', value: addr.village },
        { key: 'town', label: 'Pueblo', value: addr.town },
        { key: 'city', label: 'Ciudad', value: addr.city },
        { key: 'municipality', label: 'Municipio', value: addr.municipality },
        { key: 'county', label: 'Condado/Departamento', value: addr.county },
        { key: 'state', label: 'Provincia/Estado', value: addr.state },
        { key: 'region', label: 'Región', value: addr.region },
        { key: 'country', label: 'País', value: addr.country }
      ];
      
      hierarchy.forEach(item => {
        if (item.value) {
          console.log(`   ✓ ${item.label}: ${item.value}`);
        }
      });
    }
    
    // Esperar 1 segundo para respetar rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function runTests() {
  console.log('🚀 Probando diferentes ubicaciones con Nominatim API\n');
  
  // Prueba 1: Establecimiento Demo (Distrito Espinillo)
  await testNominatim(-32.0217, -60.2297, 'Establecimiento Demo (Entre Ríos)');
  
  // Prueba 2: Establecimiento yy (Plottier, Neuquén)
  await testNominatim(-38.941072, -68.1979736, 'Establecimiento yy (Neuquén)');
  
  // Prueba 3: Zona rural remota
  await testNominatim(-38.0, -68.0, 'Zona rural genérica (Neuquén)');
  
  // Prueba 4: Buenos Aires (ciudad grande)
  await testNominatim(-34.6037, -58.3816, 'Buenos Aires (capital)');
  
  console.log('\n\n✅ Pruebas completadas');
}

runTests();
