import React, { useState, useEffect } from 'react';
import { Power, Thermometer, Droplets, Clock, Edit2, Save, X, Settings2 } from 'lucide-react';
import { api } from '../api/client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { IntelligentSettingsModal } from './IntelligentSettingsModal';

interface WeatherData {
  temperature: number;
  humidity: number;
  wind_speed: number;
  precipitation_amount: number;
  cloud_cover: number;
  weather_description: string;
}

interface HourlyStateData {
  isOn: boolean;
  reason?: string;
}

interface SiloCardProps {
  silo: {
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
  };
  onUpdate: () => void;
  hourlyStates?: HourlyStateData[];
  weatherForecast?: WeatherData[];
}

const siloColors = [
  { title: 'text-blue-400', bg: 'bg-blue-900/20', border: 'border-blue-700' },
  { title: 'text-purple-400', bg: 'bg-purple-900/20', border: 'border-purple-700' },
  { title: 'text-green-400', bg: 'bg-green-900/20', border: 'border-green-700' },
  { title: 'text-yellow-400', bg: 'bg-yellow-900/20', border: 'border-yellow-700' },
  { title: 'text-pink-400', bg: 'bg-pink-900/20', border: 'border-pink-700' },
  { title: 'text-indigo-400', bg: 'bg-indigo-900/20', border: 'border-indigo-700' },
  { title: 'text-cyan-400', bg: 'bg-cyan-900/20', border: 'border-cyan-700' },
  { title: 'text-orange-400', bg: 'bg-orange-900/20', border: 'border-orange-700' },
];

export const SiloCardSimple: React.FC<SiloCardProps> = ({ silo, onUpdate, hourlyStates = [], weatherForecast = [] }) => {
  const [selectedHourIndex, setSelectedHourIndex] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showIASettings, setShowIASettings] = useState(false);
  const showChart = !!silo.has_sensor_bar;
  
  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (showChart) {
      loadHistory();
    }
  }, [showChart, silo.id]);

  const loadHistory = async () => {
    try {
      setLoadingHistory(true);
      const response = await api.get(`/sensors/silo/${silo.id}/temperature-history`);
      setHistoryData(response.data);
    } catch (error) {
      console.error('Error al cargar historial:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const sensorKeys = historyData.length > 0 
    ? Object.keys(historyData[0]).filter(k => k !== 'timestamp')
    : [];

  const formatXAxis = (tickItem: string) => {
    const date = new Date(tickItem);
    return `${date.getDate()}/${date.getMonth() + 1} ${date.getHours()}:00`;
  };

  const chartColors = [
    '#60a5fa', '#a78bfa', '#4ade80', '#fbbf24', '#f472b6', '#818cf8', '#22d3ee', '#fb923c'
  ];

  const siloColorIndex = (silo.id - 1) % siloColors.length;
  const siloColor = siloColors[siloColorIndex];
  
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    min_temperature: silo.min_temperature,
    max_temperature: silo.max_temperature,
    min_humidity: silo.min_humidity,
    max_humidity: silo.max_humidity,
    peak_hours_shutdown: silo.peak_hours_shutdown,
    air_start_hour: silo.air_start_hour,
    air_end_hour: silo.air_end_hour,
    use_sun_schedule: silo.use_sun_schedule,
    manual_mode: silo.manual_mode
  });

  const getSiloStatusColor = () => {
    if (silo.manual_mode === 'off') return 'gray';
    if (silo.current_state) return 'green';
    if (silo.forced_off_reason) return 'red';
    return 'yellow';
  };


  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    // Reset form data to original values
    setFormData({
      min_temperature: silo.min_temperature,
      max_temperature: silo.max_temperature,
      min_humidity: silo.min_humidity,
      max_humidity: silo.max_humidity,
      peak_hours_shutdown: silo.peak_hours_shutdown,
      air_start_hour: silo.air_start_hour,
      air_end_hour: silo.air_end_hour,
      use_sun_schedule: silo.use_sun_schedule,
      manual_mode: silo.manual_mode
    });
  };

  const handleSave = async () => {
    try {
      console.log('=== Guardando silo ===');
      console.log('Silo ID:', silo.id);
      console.log('FormData:', formData);
      
      const payload = {
        name: silo.name,
        establishment_id: silo.establishment_id,
        aerator_position: silo.aerator_position,
        ...formData
      };
      
      console.log('Payload completo:', payload);
      
      const response = await api.put(`/silos-management/${silo.id}`, payload);
      
      console.log('✓ Respuesta del servidor:', response.data);
      setIsEditing(false);
      if (onUpdate) onUpdate();
      alert('Cambios guardados exitosamente');
    } catch (error: any) {
      console.error('❌ Error updating silo:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);
      alert(`Error al guardar los cambios: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleModeChange = async (newMode: string) => {
    try {
      // Usar los valores actuales del silo pero cambiar el modo
      const payload = {
        name: silo.name,
        establishment_id: silo.establishment_id,
        aerator_position: silo.aerator_position,
        min_temperature: silo.min_temperature,
        max_temperature: silo.max_temperature,
        min_humidity: silo.min_humidity,
        max_humidity: silo.max_humidity,
        peak_hours_shutdown: silo.peak_hours_shutdown,
        air_start_hour: silo.air_start_hour,
        air_end_hour: silo.air_end_hour,
        use_sun_schedule: silo.use_sun_schedule,
        manual_mode: newMode
      };
      
      await api.put(`/silos-management/${silo.id}`, payload);
      if (onUpdate) onUpdate();
    } catch (error: any) {
      console.error('Error changing mode:', error);
      alert(`Error al cambiar el modo: ${error.response?.data?.error || error.message}`);
    }
  };

  const getColorClasses = (color: string) => {
    switch (color) {
      case 'green':
        return {
          bg: 'bg-green-900/20',
          border: 'border-green-700',
          text: 'text-green-400',
          badge: 'bg-green-900/50 text-green-300'
        };
      case 'yellow':
        return {
          bg: 'bg-yellow-900/20',
          border: 'border-yellow-700',
          text: 'text-yellow-400',
          badge: 'bg-yellow-900/50 text-yellow-300'
        };
      case 'red':
        return {
          bg: 'bg-red-900/20',
          border: 'border-red-700',
          text: 'text-red-400',
          badge: 'bg-red-900/50 text-red-300'
        };
      default:
        return {
          bg: 'bg-slate-800/50',
          border: 'border-slate-700',
          text: 'text-slate-400',
          badge: 'bg-slate-700 text-slate-300'
        };
    }
  };

  const statusColor = getSiloStatusColor();
  const colors = getColorClasses(statusColor);

  return (
    <div className={`${colors.bg} ${siloColor.bg} border-2 ${colors.border} ${siloColor.border} rounded-lg shadow-lg p-3 md:p-6 transition-all hover:shadow-xl backdrop-blur-sm`}>
      {/* Header del Silo */}
      <div className="mb-3 md:mb-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h4 className={`text-sm md:text-lg font-bold ${siloColor.title} ${siloColor.bg} ${siloColor.border} border px-2 md:px-3 py-1 md:py-1.5 rounded-lg flex-shrink-0`}>
            {silo.name}
          </h4>
          <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
            <div className={`px-2 md:px-3 py-0.5 md:py-1 rounded-full text-xs font-semibold ${colors.badge} whitespace-nowrap`}>
              {silo.manual_mode === 'off' ? 'Deshabilitado' : silo.current_state ? 'Aireador Encendido' : 'Aireador Apagado'}
            </div>
            {!isEditing && (
              <button
                onClick={handleEdit}
                className="p-1.5 md:p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors flex-shrink-0"
                title="Editar configuración"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            )}
            {!!silo.has_sensor_bar && (
              <button
                onClick={() => setShowIASettings(true)}
                className="p-1.5 md:p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors flex-shrink-0"
                title="Configuración Inteligente"
              >
                <Settings2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        {/* Razones de apagado - mostradas debajo del nombre */}
        {!silo.current_state && silo.forced_off_reason && silo.manual_mode !== 'off' && (
          <div className="flex flex-col gap-1">
            {silo.forced_off_reason.split(', ').map((reason, index) => (
              <div key={index} className="px-2 py-1 bg-red-900/30 border border-red-700/50 rounded text-xs text-red-300">
                ⚠️ {reason}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Estado del Aireador */}
      <div className="mb-3 md:mb-4 pb-3 md:pb-4 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <span className="text-xs md:text-sm font-medium text-slate-300">Estado Actual</span>
          <div className="flex items-center gap-1.5 md:gap-2">
            {silo.current_state ? (
              <>
                <Power className="w-4 h-4 md:w-5 md:h-5 text-green-400" />
                <span className="text-xs md:text-sm font-semibold text-green-400">Encendido</span>
              </>
            ) : (
              <>
                <Power className="w-4 h-4 md:w-5 md:h-5 text-slate-500" />
                <span className="text-xs md:text-sm font-semibold text-slate-500">Apagado</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Configuración */}
      <div className="space-y-2 md:space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 md:gap-2">
            <Thermometer className="w-3.5 h-3.5 md:w-4 md:h-4 text-slate-400 flex-shrink-0" />
            <span className="text-xs md:text-sm text-slate-400">Temperatura</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-xs md:text-sm font-semibold text-white whitespace-nowrap">
              {silo.min_temperature}°C - {silo.max_temperature}°C
            </span>
            {weatherForecast[0] && (
              <span className={`text-xs ${
                weatherForecast[0].temperature < silo.min_temperature || 
                weatherForecast[0].temperature > silo.max_temperature
                  ? 'text-red-400 font-semibold'
                  : 'text-slate-500'
              }`}>
                Actual: {weatherForecast[0].temperature.toFixed(1)}°C
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 md:gap-2">
            <Droplets className="w-3.5 h-3.5 md:w-4 md:h-4 text-slate-400 flex-shrink-0" />
            <span className="text-xs md:text-sm text-slate-400">Humedad</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-xs md:text-sm font-semibold text-white whitespace-nowrap">
              {silo.min_humidity}% - {silo.max_humidity}%
            </span>
            {weatherForecast[0] && (
              <span className={`text-xs ${
                weatherForecast[0].humidity < silo.min_humidity || 
                weatherForecast[0].humidity > silo.max_humidity
                  ? 'text-red-400 font-semibold'
                  : 'text-slate-500'
              }`}>
                Actual: {weatherForecast[0].humidity.toFixed(0)}%
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 md:gap-2">
            <Clock className="w-3.5 h-3.5 md:w-4 md:h-4 text-slate-400 flex-shrink-0" />
            <span className="text-xs md:text-sm text-slate-400">Horario</span>
          </div>
          <span className="text-xs md:text-sm font-semibold text-white whitespace-nowrap">
            {silo.use_sun_schedule ? 'Solar' : `${silo.air_start_hour}:00 - ${silo.air_end_hour}:00`}
          </span>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-700">
          <span className="text-xs md:text-sm text-slate-400">Modo de Operación</span>
          <div className="flex bg-slate-800 p-1 rounded-lg gap-1 border border-slate-700">
            <button
              onClick={() => handleModeChange('auto')}
              className={`px-2 py-1 text-[10px] md:text-xs font-bold rounded-md transition-all ${
                silo.manual_mode === 'auto'
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              }`}
            >
              AUTO
            </button>
            <button
              onClick={() => handleModeChange('on')}
              className={`px-2 py-1 text-[10px] md:text-xs font-bold rounded-md transition-all ${
                silo.manual_mode === 'on'
                  ? 'bg-green-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              }`}
            >
              ON
            </button>
            <button
              onClick={() => handleModeChange('off')}
              className={`px-2 py-1 text-[10px] md:text-xs font-bold rounded-md transition-all ${
                silo.manual_mode === 'off'
                  ? 'bg-red-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              }`}
            >
              OFF
            </button>
            {!!silo.has_sensor_bar && (
              <button
                onClick={() => handleModeChange('intelligent')}
                className={`px-2 py-1 text-[10px] md:text-xs font-bold rounded-md transition-all ${
                  silo.manual_mode === 'intelligent'
                    ? 'bg-purple-600 text-white shadow-lg'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                }`}
              >
                INT
              </button>
            )}
          </div>
        </div>

        {!!silo.peak_hours_shutdown && (
          <div className="mt-2 px-2 md:px-3 py-1.5 md:py-2 bg-yellow-900/20 border border-yellow-700 rounded text-xs text-yellow-300">
            ⚡ Apagado en horas pico (17:00-23:00)
          </div>
        )}
      </div>

      {/* Gráfico de Temperaturas */}
      {showChart && (
        <div className="mt-4 pt-4 border-t border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs md:text-sm font-medium text-slate-300">Historial de Sensores (7d)</span>
            <button 
              onClick={loadHistory}
              className="text-[10px] text-blue-400 hover:underline"
            >
              Actualizar
            </button>
          </div>
          
          <div className="h-48 w-full">
            {loadingHistory ? (
              <div className="h-full flex items-center justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
              </div>
            ) : historyData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={historyData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis 
                    dataKey="timestamp" 
                    tickFormatter={formatXAxis} 
                    stroke="#94a3b8" 
                    fontSize={10}
                    minTickGap={30}
                  />
                  <YAxis 
                    stroke="#94a3b8" 
                    fontSize={10} 
                    domain={['auto', 'auto']}
                    unit="°"
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                    itemStyle={{ fontSize: '10px' }}
                    labelStyle={{ fontSize: '10px', marginBottom: '4px', color: '#94a3b8' }}
                    labelFormatter={(label) => formatXAxis(label)}
                  />
                  <Legend 
                    iconType="circle" 
                    wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }}
                  />
                  {sensorKeys.map((key, index) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      name={key}
                      stroke={chartColors[index % chartColors.length]}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500 italic">
                No hay datos históricos para este silo
              </div>
            )}
          </div>
        </div>
      )}

      {showIASettings && (
        <IntelligentSettingsModal
          siloId={silo.id}
          siloName={silo.name}
          onClose={() => setShowIASettings(false)}
          onSave={() => {
            if (onUpdate) onUpdate();
          }}
        />
      )}

      {/* Cuadrícula de estados de 24 horas */}
      {hourlyStates.length > 0 && (
        <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs md:text-sm font-medium text-slate-300">Próximas 24 horas</span>
            <span className="text-xs text-slate-400">Ahora →</span>
          </div>
          <div className="grid grid-cols-12 gap-0.5 md:gap-1">
            {hourlyStates.slice(0, 24).map((state, index) => {
              const currentHour = new Date().getHours();
              const hour = (currentHour + index) % 24;
              const weatherData = weatherForecast[index];
              
              // Determinar si los valores están fuera de rango
              const tempOutOfRange = weatherData && (
                weatherData.temperature < silo.min_temperature || 
                weatherData.temperature > silo.max_temperature
              );
              const humidityOutOfRange = weatherData && (
                weatherData.humidity < silo.min_humidity || 
                weatherData.humidity > silo.max_humidity
              );
              const hasRain = weatherData && weatherData.precipitation_amount > 0;
              
              return (
                <div
                  key={index}
                  className={`aspect-square rounded ${
                    state.isOn 
                      ? 'bg-green-500 hover:bg-green-400' 
                      : 'bg-red-500 hover:bg-red-400'
                  } transition-colors relative group cursor-pointer flex items-center justify-center`}
                  onClick={() => setSelectedHourIndex(selectedHourIndex === index ? null : index)}
                >
                  {/* Hora dentro del cuadradito */}
                  <span className="text-white font-bold text-xs md:text-sm z-10">
                    {hour}
                  </span>
                  
                  {/* Tooltip para desktop (hover) */}
                  {weatherData && (
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-slate-900 border border-slate-700 text-white text-xs px-3 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-20 hidden md:block shadow-xl">
                      <div className="font-semibold mb-1.5 text-center border-b border-slate-600 pb-1">
                        {state.isOn ? '✅ Encendido' : '🔴 Apagado'}
                      </div>
                      <div className="space-y-0.5">
                        <div className={tempOutOfRange ? 'text-red-400 font-semibold' : ''}>
                          🌡️ {weatherData.temperature.toFixed(1)}°C
                        </div>
                        <div className={humidityOutOfRange ? 'text-red-400 font-semibold' : ''}>
                          💧 {weatherData.humidity.toFixed(0)}%
                        </div>
                        {hasRain && (
                          <div className="text-blue-300">
                            🌧️ {weatherData.precipitation_amount.toFixed(1)}mm
                          </div>
                        )}
                        {!state.isOn && state.reason && (
                          <div className="text-red-400 font-semibold mt-1.5 pt-1.5 border-t border-slate-600">
                            ⚠️ {state.reason}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Tooltip para móvil (click) */}
                  {weatherData && selectedHourIndex === index && (
                    <div className="md:hidden absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-slate-900 border border-slate-700 text-white text-xs px-3 py-2 rounded-lg whitespace-nowrap z-20 shadow-xl">
                      <div className="font-semibold mb-1.5 text-center border-b border-slate-600 pb-1">
                        {state.isOn ? '✅ Encendido' : '🔴 Apagado'}
                      </div>
                      <div className="space-y-0.5">
                        <div className={tempOutOfRange ? 'text-red-400 font-semibold' : ''}>
                          🌡️ {weatherData.temperature.toFixed(1)}°C
                        </div>
                        <div className={humidityOutOfRange ? 'text-red-400 font-semibold' : ''}>
                          💧 {weatherData.humidity.toFixed(0)}%
                        </div>
                        {hasRain && (
                          <div className="text-blue-300">
                            🌧️ {weatherData.precipitation_amount.toFixed(1)}mm
                          </div>
                        )}
                        {!state.isOn && state.reason && (
                          <div className="text-red-400 font-semibold mt-1.5 pt-1.5 border-t border-slate-600">
                            ⚠️ {state.reason}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-2 text-xs text-slate-400">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-green-500 rounded"></div>
              <span>Encendido</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-red-500 rounded"></div>
              <span>Apagado</span>
            </div>
          </div>
          <div className="text-xs text-slate-500 mt-2 text-center">
            {isMobile ? 'Toca' : 'Pasa el mouse sobre'} un cuadrado para ver detalles
          </div>
        </div>
      )}

      {isEditing && (
        <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t border-slate-700">
          <div className="space-y-2 md:space-y-3">
            <div className="grid grid-cols-2 gap-2 md:gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Temp. Mín (°C)</label>
                <input
                  type="number"
                  value={formData.min_temperature}
                  onChange={(e) => handleInputChange('min_temperature', parseFloat(e.target.value))}
                  className="w-full px-2 py-1.5 md:py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Temp. Máx (°C)</label>
                <input
                  type="number"
                  value={formData.max_temperature}
                  onChange={(e) => handleInputChange('max_temperature', parseFloat(e.target.value))}
                  className="w-full px-2 py-1.5 md:py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Humedad Mín (%)</label>
                <input
                  type="number"
                  value={formData.min_humidity}
                  onChange={(e) => handleInputChange('min_humidity', parseFloat(e.target.value))}
                  className="w-full px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Humedad Máx (%)</label>
                <input
                  type="number"
                  value={formData.max_humidity}
                  onChange={(e) => handleInputChange('max_humidity', parseFloat(e.target.value))}
                  className="w-full px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Hora Inicio</label>
                <select
                  value={formData.air_start_hour}
                  onChange={(e) => handleInputChange('air_start_hour', parseInt(e.target.value))}
                  className="w-full px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white"
                >
                  {Array.from({length: 24}, (_, i) => (
                    <option key={i} value={i}>{i}:00</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Hora Fin</label>
                <select
                  value={formData.air_end_hour}
                  onChange={(e) => handleInputChange('air_end_hour', parseInt(e.target.value))}
                  className="w-full px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white"
                >
                  {Array.from({length: 24}, (_, i) => (
                    <option key={i} value={i}>{i}:00</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-slate-400">Modo</label>
                <select
                  value={formData.manual_mode}
                  onChange={(e) => handleInputChange('manual_mode', e.target.value)}
                  className="px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white"
                >
                  <option value="auto">AUTO</option>
                  <option value="on">ON</option>
                  <option value="off">OFF</option>
                </select>
              </div>
              
              <div className="flex items-center justify-between">
                <label className="text-xs text-slate-400">Usar horario solar</label>
                <input
                  type="checkbox"
                  checked={formData.use_sun_schedule}
                  onChange={(e) => handleInputChange('use_sun_schedule', e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-slate-800 border-slate-600 rounded"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <label className="text-xs text-slate-400">Apagar en horas pico</label>
                <input
                  type="checkbox"
                  checked={formData.peak_hours_shutdown}
                  onChange={(e) => handleInputChange('peak_hours_shutdown', e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-slate-800 border-slate-600 rounded"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSave}
                className="flex-1 px-3 py-2.5 md:py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span className="hidden sm:inline">Guardar</span>
                <span className="sm:hidden">✓</span>
              </button>
              <button
                onClick={handleCancel}
                className="flex-1 px-3 py-2.5 md:py-2 bg-slate-600 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <X className="w-4 h-4" />
                <span className="hidden sm:inline">Cancelar</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
