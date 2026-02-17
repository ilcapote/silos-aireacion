import { useState, useEffect } from 'react';
import { Cloud, CloudRain, Droplets, Thermometer, Activity, Building2, ChevronRight } from 'lucide-react';
import { api } from '../api/client';
import { SiloCardSimple } from './SiloCardSimple';
import { Establishment } from '../api/establishments';

interface WeatherData {
  temperature: number;
  humidity: number;
  wind_speed: number;
  precipitation_amount: number;
  cloud_cover: number;
  weather_description: string;
}

interface SiloData {
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
  manual_mode: string;
  current_state: boolean;
  forced_off_reason?: string;
  has_sensor_bar?: boolean;
}

interface EstablishmentData {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  city?: string;
}

interface MonitoringData {
  establishment: EstablishmentData;
  weather: WeatherData | null;
  weather_forecast: WeatherData[];
  silos: SiloData[];
  states_24h: any;
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

interface MonitoringDashboardProps {
  establishmentId: number | null;
}

export function MonitoringDashboard({ establishmentId }: MonitoringDashboardProps) {
  const [silos, setSilos] = useState<SiloData[]>([]);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherForecast, setWeatherForecast] = useState<WeatherData[]>([]);
  const [establishment, setEstablishment] = useState<EstablishmentData | null>(null);
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [states24h, setStates24h] = useState<HourlyState[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (establishmentId === null) {
      loadAllEstablishments();
    } else {
      loadMonitoringData();
    }
    
    // Actualizar datos cada 5 minutos
    const interval = setInterval(() => {
      if (establishmentId !== null) {
        loadMonitoringData();
      }
    }, 300000);

    return () => clearInterval(interval);
  }, [establishmentId]);

  const loadAllEstablishments = async () => {
    const token = localStorage.getItem('token') || '';
    try {
      setLoading(true);
      const response = await api.get('/establishments', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEstablishments(response.data);
    } catch (error) {
      console.error('Error al cargar todos los establecimientos:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMonitoringData = async () => {
    if (establishmentId === null) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      const response = await api.get<MonitoringData>(`/silos/establishment/${establishmentId}/states`);
      const data = response.data;
      
      setEstablishment(data.establishment);
      setWeather(data.weather);
      setWeatherForecast(data.weather_forecast || []);
      setSilos(data.silos);
      
      // Obtener estados de 24h si hay datos de states_24h
      if (data.states_24h && data.states_24h.states) {
        setStates24h(data.states_24h.states);
      }
    } catch (error) {
      console.error('Error al cargar datos de monitoreo:', error);
    } finally {
      setLoading(false);
    }
  };

  const getWeatherCondition = (description: string): string => {
    const desc = description.toLowerCase();
    if (desc.includes('clear')) return 'Despejado';
    if (desc.includes('cloud')) return 'Nublado';
    if (desc.includes('rain')) return 'Lluvia';
    if (desc.includes('snow')) return 'Nieve';
    if (desc.includes('fog')) return 'Niebla';
    return 'Parcialmente nublado';
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (establishmentId === null) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
            <Building2 className="w-6 h-6 text-blue-400" />
            Todos los Establecimientos
          </h2>
          <p className="text-slate-400 text-sm">{establishments.length} Registrados</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {establishments.map((est) => (
            <div 
              key={est.id}
              className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-blue-500/50 transition-all group cursor-pointer"
              onClick={() => {
                // Esto disparará el cambio en el Dashboard si usamos una prop de callback, 
                // pero por ahora solo mostramos la info.
                const select = document.querySelector('select');
                if (select) {
                  select.value = est.id.toString();
                  select.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="bg-blue-500/10 p-2.5 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                  <Building2 className="w-6 h-6 text-blue-400" />
                </div>
                <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-blue-400 transition-colors" />
              </div>
              
              <h3 className="text-lg font-bold text-white mb-1 group-hover:text-blue-400 transition-colors">
                {est.name}
              </h3>
              <p className="text-slate-400 text-sm mb-4">{est.city || 'Ubicación no especificada'}</p>
              
              <div className="space-y-2 pt-4 border-t border-slate-700/50">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Propietario:</span>
                  <span className="text-slate-200 font-medium">{est.owner}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Coordenadas:</span>
                  <span className="text-slate-200 font-medium">
                    {est.latitude.toFixed(4)}, {est.longitude.toFixed(4)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {establishments.length === 0 && (
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-12 text-center">
            <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">No hay establecimientos registrados en el sistema.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 px-2 md:px-0">
      {/* Sección del Clima */}
      {weather && establishment && (
        <div className="bg-gradient-to-r from-blue-900 to-blue-800 border border-blue-700 rounded-lg shadow-lg p-4 md:p-6 text-white">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
            <div className="flex items-center gap-2 md:gap-3">
              <Cloud className="w-6 h-6 md:w-8 md:h-8 flex-shrink-0" />
              <div>
                <h2 className="text-lg md:text-2xl font-bold">Condiciones Climáticas</h2>
                <p className="text-blue-300 text-xs md:text-sm">
                  {establishment.name} {establishment.city && `• ${establishment.city}`}
                </p>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-xs md:text-sm text-blue-300">Datos en tiempo real</p>
              <p className="text-xs text-blue-400">MET Norway API</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-4">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 md:p-4">
              <div className="flex items-center gap-1.5 md:gap-2 mb-1 md:mb-2">
                <Thermometer className="w-4 h-4 md:w-5 md:h-5 flex-shrink-0" />
                <span className="text-xs md:text-sm font-medium">Temperatura</span>
              </div>
              <p className="text-xl md:text-3xl font-bold">{weather.temperature.toFixed(1)}°C</p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 md:p-4">
              <div className="flex items-center gap-1.5 md:gap-2 mb-1 md:mb-2">
                <Droplets className="w-4 h-4 md:w-5 md:h-5 flex-shrink-0" />
                <span className="text-xs md:text-sm font-medium">Humedad</span>
              </div>
              <p className="text-xl md:text-3xl font-bold">{weather.humidity.toFixed(0)}%</p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 md:p-4">
              <div className="flex items-center gap-1.5 md:gap-2 mb-1 md:mb-2">
                <CloudRain className="w-4 h-4 md:w-5 md:h-5 flex-shrink-0" />
                <span className="text-xs md:text-sm font-medium">Condición</span>
              </div>
              <p className="text-sm md:text-lg font-semibold">{getWeatherCondition(weather.weather_description)}</p>
              {weather.precipitation_amount > 0 && (
                <p className="text-xs text-blue-300 mt-0.5 md:mt-1">Precip: {weather.precipitation_amount.toFixed(1)} mm</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Título de Silos */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h3 className="text-lg md:text-xl font-bold text-white">Estado de Silos</h3>
        <button
          onClick={loadMonitoringData}
          className="flex items-center gap-2 px-3 md:px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white text-sm md:text-base rounded-lg transition w-full sm:w-auto justify-center"
        >
          <Activity className="w-4 h-4" />
          Actualizar
        </button>
      </div>

      {/* Grid de Silos */}
      {silos.length === 0 ? (
        <div className="bg-slate-800 border border-slate-700 rounded-lg shadow p-8 text-center">
          <p className="text-slate-400">No hay silos configurados</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
          {silos.map((silo) => {
            // Obtener estados de 24h para este silo específico
            const siloStates24h = states24h.map(hourState => {
              const siloState = hourState.states.find(s => s.silo_id === silo.id);
              return {
                isOn: siloState ? siloState.is_on : false,
                reason: siloState?.forced_off_reason
              };
            });
            
            return (
              <SiloCardSimple 
                key={silo.id} 
                silo={silo} 
                onUpdate={loadMonitoringData}
                hourlyStates={siloStates24h}
                weatherForecast={weatherForecast}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
