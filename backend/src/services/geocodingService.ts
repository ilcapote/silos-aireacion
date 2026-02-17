import axios from 'axios';

interface NominatimResponse {
  address: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
  };
  display_name: string;
}

class GeocodingService {
  private cache: Map<string, string> = new Map();
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 1000; // 1 segundo entre requests (respetando política de uso de Nominatim)

  /**
   * Obtiene el nombre de la ciudad/localidad basado en coordenadas
   * Usa la API de Nominatim (OpenStreetMap) con geocodificación inversa
   */
  async getCityFromCoordinates(latitude: number, longitude: number): Promise<string> {
    const cacheKey = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
    
    // Verificar caché
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    try {
      // Respetar rate limiting
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      if (timeSinceLastRequest < this.minRequestInterval) {
        await new Promise(resolve => setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest));
      }
      this.lastRequestTime = Date.now();

      // Hacer request a Nominatim
      const response = await axios.get<NominatimResponse>(
        'https://nominatim.openstreetmap.org/reverse',
        {
          params: {
            lat: latitude,
            lon: longitude,
            format: 'json',
            addressdetails: 1,
            zoom: 10
          },
          headers: {
            'User-Agent': 'SilosAireacionApp/1.0'
          },
          timeout: 5000
        }
      );

      if (response.data && response.data.address) {
        const address = response.data.address;
        // Priorizar ciudad, luego pueblo, villa, municipio, condado
        const cityName = address.city || 
                        address.town || 
                        address.village || 
                        address.municipality || 
                        address.county || 
                        address.state ||
                        'Ubicación no identificada';
        
        // Guardar en caché
        this.cache.set(cacheKey, cityName);
        
        console.log(`✅ Geocodificación: ${latitude}, ${longitude} -> ${cityName}`);
        return cityName;
      }

      return 'Ubicación no identificada';
    } catch (error: any) {
      console.error('Error en geocodificación inversa:', error.message);
      return 'Ubicación no identificada';
    }
  }

  /**
   * Limpia la caché de geocodificación
   */
  clearCache(): void {
    this.cache.clear();
  }
}

export const geocodingService = new GeocodingService();
