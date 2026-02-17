import { weatherService, WeatherHourData } from './weatherService';
import { equilibriumService } from './equilibriumService';
import { db } from '../database/db';

interface IntelligentConfig {
  grain_type: string;
  target_grain_moisture: number;
  target_temp?: number;
  achieve_temperature: boolean;
  achieve_humidity: boolean;
  operation_type: 'dry' | 'humidify';
  anti_condensation: boolean;
  delta_temp_min: number;
  delta_temp_hyst: number;
  delta_emc_min: number;
  active: boolean;
}

interface SiloConfig {
  id: number;
  name: string;
  establishment_id: number;
  aerator_position: number;
  min_temperature: number;
  max_temperature: number;
  min_humidity: number;
  max_humidity: number;
  peak_hours_shutdown: boolean;
  air_start_hour: number;
  air_end_hour: number;
  use_sun_schedule: boolean;
  manual_mode: string; // 'auto', 'on', 'off', 'intelligent'
  modified: boolean;
  intelligent_config?: IntelligentConfig;
}

interface EstablishmentConfig {
  id: number;
  latitude: number;
  longitude: number;
  max_operating_current?: number;
  current_sensor_id?: string;
}

interface HourlyState {
  hour: string;
  states: {
    silo_id: number;
    position: number;
    is_on: boolean;
    forced_off_reason?: string;
  }[];
}

class AerationService {
  /**
   * Evalúa si un silo puede operar en una hora específica
   * Basado en condiciones climáticas y configuración del silo
   */
  private async evaluateSiloOperation(
    silo: SiloConfig,
    hourData: WeatherHourData,
    establishment: EstablishmentConfig,
    rainHoursIdx: Set<number>,
    hourIdx: number,
    sunHours?: { sunrise_hour: number; sunset_hour: number } | null
  ): Promise<{ isOn: boolean; reason?: string }> {
    const temp = hourData.temperature;
    const humidity = hourData.humidity;
    
    // Extraer hora del día (0-23)
    const hourParts = hourData.hour.split(' ')[1].split(':');
    const currentHourOfDay = parseInt(hourParts[0]);

    // 1. Condiciones Universales de Seguridad
    const noRain = !rainHoursIdx.has(hourIdx);
    
    // Detectar niebla: fog_area_fraction o humedad muy alta (>95%) con temperatura baja (<15°C)
    const hasFog = hourData.fog || (hourData.humidity > 95 && temp < 15);
    
    // Detectar cobertura de nubes extrema (>90%)
    const heavyClouds = hourData.cloud_cover > 90;
    
    const noFog = !hasFog && !heavyClouds;
    
    // Horas pico: 17:00 a 22:59
    const peakHoursActive = currentHourOfDay >= 17 && currentHourOfDay < 23;
    const peakHoursOk = !(silo.peak_hours_shutdown && peakHoursActive);
    
    
    // Verificar restricción horaria
    let airTimeOk = true;
    
    if (silo.use_sun_schedule) {
      // Usar horario basado en horas de sol (ya precalculado)
      
      if (sunHours) {
        const { sunrise_hour, sunset_hour } = sunHours;
        
        // Verificar si está dentro del horario solar
        let sunTimeOk: boolean;
        if (sunrise_hour <= sunset_hour) {
          sunTimeOk = currentHourOfDay >= sunrise_hour && currentHourOfDay < sunset_hour;
        } else {
          sunTimeOk = currentHourOfDay >= sunrise_hour || currentHourOfDay < sunset_hour;
        }
        
        // Verificar si está nublado (más del 70% de cobertura)
        const cloudyWeather = hourData.cloud_cover > 70;
        
        // Solo operar si está dentro del horario solar Y no está nublado
        airTimeOk = sunTimeOk && !cloudyWeather;
      } else {
        airTimeOk = false; // Si no se pueden obtener horas de sol, no operar
      }
    } else {
      // Usar horario manual tradicional
      const airStartHour = silo.air_start_hour;
      const airEndHour = silo.air_end_hour;
      
      // Si es el rango completo (0-23), siempre está ok
      if (airStartHour === 0 && airEndHour === 23) {
        airTimeOk = true;
      } else {
        if (airStartHour < airEndHour) {
          // Rango normal (ej: 8-17)
          airTimeOk = currentHourOfDay >= airStartHour && currentHourOfDay < airEndHour;
        } else {
          // Rango que cruza medianoche (ej: 22-6)
          airTimeOk = currentHourOfDay >= airStartHour || currentHourOfDay < airEndHour;
        }
      }
    }
    
    // 2. Lógica de Decisión por Modo
    let finalSafeToOperate = false;
    let offReason: string | undefined;

    if (silo.manual_mode === 'on') {
      // Modo manual ON: operar siempre, pero la lluvia anula el encendido
      if (!noRain) {
        offReason = 'Lluvia';
      }
      finalSafeToOperate = noRain;
    } else if (silo.manual_mode === 'off') {
      // Modo manual OFF: nunca operar
      finalSafeToOperate = false;
      offReason = 'Modo manual OFF';
    } else if (silo.manual_mode === 'intelligent') {
      // Modo inteligente: Evaluar basado en sensores internos y clima externo
      if (!noRain) {
        return { isOn: false, reason: 'Lluvia' };
      }

      const config = silo.intelligent_config;
      if (!config || !config.active) {
        return { isOn: false, reason: 'Configuración inteligente no activa' };
      }

      // 1. Obtener últimas lecturas de temperatura del silo
      const readings = db.prepare(`
        SELECT temperature FROM temperature_readings
        WHERE silo_id = ?
        AND timestamp >= datetime('now', '-24 hours')
        ORDER BY timestamp DESC
      `).all(silo.id) as { temperature: number }[];

      if (readings.length === 0) {
        return { isOn: false, reason: 'Sin lecturas de sensores recientes' };
      }

      const tempValues = readings.map(r => r.temperature);
      const maxInternalTemp = Math.max(...tempValues);
      const minInternalTemp = Math.min(...tempValues);
      const avgInternalTemp = tempValues.reduce((a, b) => a + b, 0) / tempValues.length;

      // 2. Protección Anti-Condensación
      // Si el punto de rocío del aire exterior es mayor que la temperatura más fría del grano,
      // habrá condensación. Detenemos todo por seguridad.
      if (config.anti_condensation) {
        const dewPointExt = equilibriumService.getDewPoint(temp, humidity);
        if (dewPointExt >= minInternalTemp - 2) { // Margen de 2 grados
          return { isOn: false, reason: 'Riesgo de condensación' };
        }
      }

      let decisionTemp = false;
      let decisionHum = false;

      // 3.1. Evaluar "Alcanzar Temperatura" (Prioridad 1)
      if (config.achieve_temperature && config.target_temp !== undefined) {
        const necesitaEnfriar = maxInternalTemp > (config.target_temp + config.delta_temp_hyst);
        const aireUtil = temp < (maxInternalTemp - config.delta_temp_min);
        decisionTemp = necesitaEnfriar && aireUtil;
        
        if (decisionTemp) {
          return { isOn: true };
        }
      }

      // 3.2. Evaluar "Alcanzar Humedad" (Prioridad 2)
      if (config.achieve_humidity) {
        const erhObjetivo = equilibriumService.getEquilibriumHumidity(
          config.grain_type,
          config.target_grain_moisture,
          avgInternalTemp
        );

        if (erhObjetivo !== null) {
          const histeresisHumedad = 2;
          if (config.operation_type === 'humidify') {
            // Humectar: Aire exterior más húmedo que el equilibrio
            decisionHum = humidity > (erhObjetivo + histeresisHumedad);
          } else {
            // Secar: Aire exterior más seco que el equilibrio
            decisionHum = humidity < (erhObjetivo - histeresisHumedad);
          }
        }
      }

      const finalSafe = decisionTemp || decisionHum;
      return { 
        isOn: finalSafe, 
        reason: !finalSafe ? 'Condiciones inteligentes no alcanzadas' : undefined 
      };
    } else if (silo.manual_mode === 'auto') {
      // Modo automático: verificar todas las condiciones
      const tempOk = temp >= silo.min_temperature && temp <= silo.max_temperature;
      const humidityOk = humidity >= silo.min_humidity && humidity <= silo.max_humidity;
      
      // Determinar razón de apagado
      const reasons: string[] = [];
      
      if (!noRain) reasons.push('Lluvia');
      if (!noFog) {
        if (hasFog) reasons.push('Niebla');
        if (heavyClouds) reasons.push('Nubes densas');
      }
      if (!peakHoursOk) reasons.push('Horas pico');
      if (!airTimeOk) {
        if (silo.use_sun_schedule) {
          reasons.push('Fuera de horario solar');
        } else {
          reasons.push('Fuera de horario');
        }
      }
      if (!tempOk) {
        if (temp < silo.min_temperature) reasons.push('Temperatura baja');
        if (temp > silo.max_temperature) reasons.push('Temperatura alta');
      }
      if (!humidityOk) {
        if (humidity < silo.min_humidity) reasons.push('Humedad baja');
        if (humidity > silo.max_humidity) reasons.push('Humedad alta');
      }
      
      if (reasons.length > 0) {
        offReason = reasons.join(', ');
      }
      
      finalSafeToOperate = tempOk && humidityOk && noRain && noFog && peakHoursOk && airTimeOk;
    }

    return { isOn: finalSafeToOperate, reason: offReason };
  }

  /**
   * Obtiene los estados de operación para las próximas 24 horas
   * para todos los silos de un establecimiento
   */
  async get24HourStates(establishmentId: number): Promise<{
    current_time: string;
    states: HourlyState[];
  }> {
    // Obtener establecimiento
    const establishment = db.prepare('SELECT * FROM establishments WHERE id = ?').get(establishmentId) as EstablishmentConfig;
    
    if (!establishment) {
      throw new Error('Establishment not found');
    }

    // Obtener silos del establecimiento
    const silos = db.prepare('SELECT * FROM silos WHERE establishment_id = ?').all(establishmentId) as SiloConfig[];
    
    // Cargar configuraciones inteligentes para cada silo
    for (const silo of silos) {
      const config = db.prepare('SELECT * FROM intelligent_aeration_configs WHERE silo_id = ?').get(silo.id) as any;
      if (config) {
        silo.intelligent_config = {
          ...config,
          achieve_temperature: !!config.achieve_temperature,
          achieve_humidity: !!config.achieve_humidity,
          anti_condensation: !!config.anti_condensation,
          active: !!config.active
        };
      }
    }
    
    // Obtener datos meteorológicos
    const weatherData = await weatherService.getWeatherData(
      establishmentId,
      establishment.latitude,
      establishment.longitude
    );

    if (!weatherData || weatherData.length === 0) {
      // Si no hay datos meteorológicos, retornar todo apagado
      const now = new Date();
      const currentTimeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:00`;
      
      const emptyStates: HourlyState[] = [];
      for (let i = 0; i < 24; i++) {
        const hourDate = new Date(now.getTime() + i * 3600000);
        const hourStr = `${hourDate.getFullYear()}-${String(hourDate.getMonth() + 1).padStart(2, '0')}-${String(hourDate.getDate()).padStart(2, '0')} ${String(hourDate.getHours()).padStart(2, '0')}:00`;
        emptyStates.push({
          hour: hourStr,
          states: silos.map(silo => ({
            silo_id: silo.id,
            position: silo.aerator_position,
            is_on: false
          }))
        });
      }
      
      return {
        current_time: currentTimeStr,
        states: emptyStates
      };
    }

    // Identificar horas con lluvia y ampliar una hora antes y después
    const rainHoursIdx = new Set<number>();
    weatherData.forEach((hourData, idx) => {
      if (hourData.precipitation_amount > 0) {
        rainHoursIdx.add(idx);
        if (idx > 0) rainHoursIdx.add(idx - 1);
        if (idx < weatherData.length - 1) rainHoursIdx.add(idx + 1);
      }
    });

    // Inicializar estructura de respuesta
    const hoursStatesResponse: HourlyState[] = weatherData.map(wd => ({
      hour: wd.hour,
      states: []
    }));

    // Obtener horas de sol UNA SOLA VEZ para todos los silos que lo necesiten
    const needsSunSchedule = silos.some(s => s.use_sun_schedule);
    const sunHours = needsSunSchedule 
      ? await weatherService.getSunHours(establishment.latitude, establishment.longitude)
      : null;

    // Evaluar cada silo para cada hora
    for (const silo of silos) {
      for (let i = 0; i < weatherData.length; i++) {
        const hourData = weatherData[i];
        const evaluation = await this.evaluateSiloOperation(
          silo,
          hourData,
          establishment,
          rainHoursIdx,
          i,
          sunHours
        );

        hoursStatesResponse[i].states.push({
          silo_id: silo.id,
          position: silo.aerator_position,
          is_on: evaluation.isOn,
          forced_off_reason: evaluation.reason
        });
      }
    }

    // TODO: Implementar protección por sobrecorriente si hay sensor de corriente
    // if (establishment.current_sensor_id && establishment.max_operating_current) {
    //   // Verificar corriente actual y forzar apagado si excede el máximo
    // }

    // Marcar todos los silos como no modificados
    const updateStmt = db.prepare('UPDATE silos SET modified = 0 WHERE establishment_id = ?');
    updateStmt.run(establishmentId);

    return {
      current_time: weatherData[0]?.hour || '',
      states: hoursStatesResponse
    };
  }

  /**
   * Verifica si algún silo del establecimiento ha sido modificado
   */
  checkModified(establishmentId: number): boolean {
    const result = db.prepare(
      'SELECT COUNT(*) as count FROM silos WHERE establishment_id = ? AND modified = 1'
    ).get(establishmentId) as { count: number };
    
    return result.count > 0;
  }

  /**
   * Marca todos los silos de un establecimiento como modificados
   * (para forzar que el ESP32 actualice su configuración)
   */
  markAsModified(establishmentId: number): void {
    db.prepare('UPDATE silos SET modified = 1 WHERE establishment_id = ?').run(establishmentId);
  }
}

export const aerationService = new AerationService();
export type { SiloConfig, EstablishmentConfig, HourlyState };
