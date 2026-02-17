import axios from 'axios';

interface WeatherHourData {
  hour: string; // Formato: 'YYYY-MM-DD HH:00'
  temperature: number;
  humidity: number;
  precipitation_amount: number;
  wind_speed: number;
  cloud_cover: number;
  fog: boolean;
  weather_description: string;
}

interface WeatherCache {
  data: WeatherHourData[];
  timestamp: number;
  establishmentId: number;
}

interface SunHoursCache {
  data: { sunrise_hour: number; sunset_hour: number };
  timestamp: number;
  key: string;
}

class WeatherService {
  private cache: Map<number, WeatherCache> = new Map();
  private sunHoursCache: Map<string, SunHoursCache> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutos - Evita saturar MET Norway API
  private readonly SUN_HOURS_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 horas - Las horas de sol cambian lentamente

  /**
   * Obtiene datos meteorológicos para un establecimiento
   * Usa cache para evitar llamadas excesivas a la API
   */
  async getWeatherData(establishmentId: number, latitude: number, longitude: number): Promise<WeatherHourData[]> {
    // Verificar cache
    const cached = this.cache.get(establishmentId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      const age = Math.floor((Date.now() - cached.timestamp) / 1000);
      console.log(`   ✅ Usando caché para establecimiento ${establishmentId} (edad: ${age}s)`);
      return cached.data;
    }

    // Obtener datos frescos de la API
    console.log(`   🌐 Consultando MET Norway API para establecimiento ${establishmentId}...`);
    const apiStart = Date.now();
    const weatherData = await this.fetchWeatherData(latitude, longitude);
    const apiTime = Date.now() - apiStart;
    console.log(`   ✅ Datos obtenidos de MET Norway en ${apiTime}ms`);
    
    // Guardar en cache
    this.cache.set(establishmentId, {
      data: weatherData,
      timestamp: Date.now(),
      establishmentId
    });

    return weatherData;
  }

  /**
   * Obtiene datos meteorológicos de la API de MET Norway
   * Retorna pronóstico horario para las próximas 24 horas
   */
  private async fetchWeatherData(latitude: number, longitude: number): Promise<WeatherHourData[]> {
    try {
      const url = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';
      const response = await axios.get(url, {
        params: {
          lat: latitude.toFixed(4),
          lon: longitude.toFixed(4)
        },
        headers: {
          'User-Agent': 'SilosAireacionSystem/1.0 (contact@example.com)'
        },
        timeout: 10000
      });

      const timeseries = response.data.properties.timeseries;
      const weatherData: WeatherHourData[] = [];
      
      // Obtener hora actual en Argentina (GMT-3)
      const now = new Date();
      const argentinaOffset = -3 * 60; // GMT-3 en minutos
      const localTime = new Date(now.getTime() + (argentinaOffset + now.getTimezoneOffset()) * 60000);
      const currentHour = new Date(localTime.getFullYear(), localTime.getMonth(), localTime.getDate(), localTime.getHours(), 0, 0);

      // Procesar las próximas 24 horas
      for (let i = 0; i < 24 && i < timeseries.length; i++) {
        const entry = timeseries[i];
        const entryTime = new Date(entry.time);
        
        // Convertir a hora local Argentina
        const localEntryTime = new Date(entryTime.getTime() + (argentinaOffset + entryTime.getTimezoneOffset()) * 60000);
        
        // Solo incluir datos desde la hora actual en adelante
        if (localEntryTime < currentHour) {
          continue;
        }

        const instant = entry.data.instant.details;
        const next1h = entry.data.next_1_hours;

        // Formatear hora como string
        const hourStr = `${localEntryTime.getFullYear()}-${String(localEntryTime.getMonth() + 1).padStart(2, '0')}-${String(localEntryTime.getDate()).padStart(2, '0')} ${String(localEntryTime.getHours()).padStart(2, '0')}:00`;

        weatherData.push({
          hour: hourStr,
          temperature: instant.air_temperature || 0,
          humidity: instant.relative_humidity || 0,
          precipitation_amount: next1h?.details?.precipitation_amount || 0,
          wind_speed: instant.wind_speed || 0,
          cloud_cover: instant.cloud_area_fraction || 0,
          fog: instant.fog_area_fraction ? instant.fog_area_fraction > 50 : false,
          weather_description: next1h?.summary?.symbol_code || 'unknown'
        });

        if (weatherData.length >= 24) break;
      }

      return weatherData;
    } catch (error) {
      console.error('Error fetching weather data:', error);
      return [];
    }
  }

  /**
   * Obtiene horas de amanecer y atardecer para una ubicación
   * Usa caché de 24 horas ya que las horas de sol cambian lentamente
   */
  async getSunHours(latitude: number, longitude: number, date?: Date): Promise<{ sunrise_hour: number; sunset_hour: number } | null> {
    try {
      const targetDate = date || new Date();
      const dateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
      const cacheKey = `${latitude.toFixed(4)}_${longitude.toFixed(4)}_${dateStr}`;

      // Verificar caché
      const cached = this.sunHoursCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.SUN_HOURS_CACHE_DURATION) {
        console.log(`   ✅ Usando caché de horas solares (${dateStr})`);
        return cached.data;
      }

      console.log(`   🌅 Consultando sunrise-sunset API...`);
      const apiStart = Date.now();
      const url = 'https://api.sunrise-sunset.org/json';
      const response = await axios.get(url, {
        params: {
          lat: latitude,
          lng: longitude,
          date: dateStr,
          formatted: 0 // UTC format
        },
        timeout: 10000
      });
      const apiTime = Date.now() - apiStart;

      if (response.data.status === 'OK') {
        const sunrise = new Date(response.data.results.sunrise);
        const sunset = new Date(response.data.results.sunset);

        // Convertir a hora local Argentina (GMT-3)
        const argentinaOffset = -3 * 60;
        const sunriseLocal = new Date(sunrise.getTime() + (argentinaOffset + sunrise.getTimezoneOffset()) * 60000);
        const sunsetLocal = new Date(sunset.getTime() + (argentinaOffset + sunset.getTimezoneOffset()) * 60000);

        const result = {
          sunrise_hour: sunriseLocal.getHours(),
          sunset_hour: sunsetLocal.getHours()
        };

        // Guardar en caché
        this.sunHoursCache.set(cacheKey, {
          data: result,
          timestamp: Date.now(),
          key: cacheKey
        });

        console.log(`   ✅ Horas solares obtenidas en ${apiTime}ms (sunrise: ${result.sunrise_hour}h, sunset: ${result.sunset_hour}h)`);
        return result;
      }

      return null;
    } catch (error) {
      console.error('Error fetching sun hours:', error);
      return null;
    }
  }

  /**
   * Limpia el cache (útil para testing o forzar actualización)
   */
  clearCache(establishmentId?: number) {
    if (establishmentId) {
      this.cache.delete(establishmentId);
    } else {
      this.cache.clear();
      this.sunHoursCache.clear();
    }
  }
}

export const weatherService = new WeatherService();
export type { WeatherHourData };
