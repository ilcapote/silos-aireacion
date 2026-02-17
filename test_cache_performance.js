const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInVzZXJuYW1lIjoiYWRtaW4iLCJpYXQiOjE3MzUyNDU2MDB9.test';

async function testCachePerformance() {
  console.log('🧪 Prueba de rendimiento del caché de pronóstico meteorológico\n');
  console.log('═'.repeat(60));
  
  // Primero obtener un establecimiento válido
  console.log('\n📍 Obteniendo establecimientos...');
  const estResponse = await fetch('http://localhost:3000/api/establishments', {
    headers: { 'Authorization': `Bearer ${TOKEN}` }
  });
  const establishments = await estResponse.json();
  
  if (!establishments || establishments.length === 0) {
    console.log('❌ No hay establecimientos en la base de datos');
    return;
  }
  
  const establishment = establishments[0];
  console.log(`✅ Establecimiento encontrado: ${establishment.name} (ID: ${establishment.id})`);
  console.log(`   Coordenadas: ${establishment.latitude}, ${establishment.longitude}`);
  
  // Primera consulta - SIN caché (o caché expirado)
  console.log('\n' + '─'.repeat(60));
  console.log('🔄 PRIMERA CONSULTA (sin caché o caché expirado)');
  console.log('─'.repeat(60));
  
  const start1 = Date.now();
  const response1 = await fetch(`http://localhost:3000/api/silos/establishment/${establishment.id}/states`, {
    headers: { 'Authorization': `Bearer ${TOKEN}` }
  });
  const data1 = await response1.json();
  const end1 = Date.now();
  const time1 = end1 - start1;
  
  console.log(`⏱️  Tiempo de respuesta: ${time1}ms`);
  console.log(`📊 Silos: ${data1.silos?.length || 0}`);
  console.log(`🌤️  Pronóstico: ${data1.weather_forecast?.length || 0} horas`);
  console.log(`📅 Estados 24h: ${data1.states_24h?.states?.length || 0} horas`);
  
  // Esperar un momento para asegurar que el caché esté guardado
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Segunda consulta - CON caché
  console.log('\n' + '─'.repeat(60));
  console.log('⚡ SEGUNDA CONSULTA (CON caché - debería ser instantánea)');
  console.log('─'.repeat(60));
  
  const start2 = Date.now();
  const response2 = await fetch(`http://localhost:3000/api/silos/establishment/${establishment.id}/states`, {
    headers: { 'Authorization': `Bearer ${TOKEN}` }
  });
  const data2 = await response2.json();
  const end2 = Date.now();
  const time2 = end2 - start2;
  
  console.log(`⏱️  Tiempo de respuesta: ${time2}ms`);
  console.log(`📊 Silos: ${data2.silos?.length || 0}`);
  console.log(`🌤️  Pronóstico: ${data2.weather_forecast?.length || 0} horas`);
  console.log(`📅 Estados 24h: ${data2.states_24h?.states?.length || 0} horas`);
  
  // Tercera consulta - CON caché
  console.log('\n' + '─'.repeat(60));
  console.log('⚡ TERCERA CONSULTA (CON caché)');
  console.log('─'.repeat(60));
  
  const start3 = Date.now();
  const response3 = await fetch(`http://localhost:3000/api/silos/establishment/${establishment.id}/states`, {
    headers: { 'Authorization': `Bearer ${TOKEN}` }
  });
  const data3 = await response3.json();
  const end3 = Date.now();
  const time3 = end3 - start3;
  
  console.log(`⏱️  Tiempo de respuesta: ${time3}ms`);
  console.log(`📊 Silos: ${data3.silos?.length || 0}`);
  console.log(`🌤️  Pronóstico: ${data3.weather_forecast?.length || 0} horas`);
  console.log(`📅 Estados 24h: ${data3.states_24h?.states?.length || 0} horas`);
  
  // Resumen
  console.log('\n' + '═'.repeat(60));
  console.log('📈 RESUMEN DE RENDIMIENTO');
  console.log('═'.repeat(60));
  console.log(`1️⃣  Primera consulta (sin caché):  ${time1}ms`);
  console.log(`2️⃣  Segunda consulta (con caché):  ${time2}ms  (${((time1/time2).toFixed(1))}x más rápida)`);
  console.log(`3️⃣  Tercera consulta (con caché):  ${time3}ms  (${((time1/time3).toFixed(1))}x más rápida)`);
  console.log(`\n💾 Mejora promedio con caché: ${(((time1 - (time2 + time3)/2) / time1 * 100).toFixed(1))}%`);
  
  if (time2 < 100 && time3 < 100) {
    console.log('\n✅ El caché está funcionando CORRECTAMENTE');
    console.log('   Las consultas subsiguientes son casi instantáneas (<100ms)');
  } else {
    console.log('\n⚠️  ADVERTENCIA: El caché podría no estar funcionando correctamente');
    console.log('   Las consultas con caché deberían ser <100ms');
  }
  
  console.log('\n💡 Nota: El caché expira después de 5 minutos');
  console.log('═'.repeat(60) + '\n');
}

testCachePerformance().catch(err => {
  console.error('❌ Error en la prueba:', err.message);
  process.exit(1);
});
