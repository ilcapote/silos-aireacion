import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { 
  Thermometer, 
  Droplets, 
  Loader2,
  AlertTriangle,
  Power,
  RefreshCw,
  Settings,
  X,
  Check,
  TrendingUp,
  ChevronLeft,
  Clock
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';

interface Silo {
  id: number;
  name: string;
  current_state: number;
  manual_mode: string;
  min_temperature: number;
  max_temperature: number;
  min_humidity: number;
  max_humidity: number;
  has_sensor_bar: boolean;
  current_temp?: number;
  forced_off_reason?: string;
  next_24h_states?: boolean[];
}

interface Weather {
  temperature: number;
  humidity: number;
  precipitation_amount: number;
}

interface HMIData {
  establishment: {
    name: string;
    city: string;
  };
  silos: Silo[];
  weather: Weather;
}

// Instancia de axios limpia para evitar interceptores de autenticación
const hmiApi = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' }
});

// Función para obtener color según temperatura
const getTempColor = (temp: number | undefined): { bg: string; text: string; label: string } => {
  if (temp === undefined || temp === null) return { bg: 'bg-slate-700', text: 'text-slate-400', label: 'Sin datos' };
  if (temp <= 17) return { bg: 'bg-blue-600', text: 'text-blue-100', label: 'FRÍO' };
  if (temp <= 22) return { bg: 'bg-green-600', text: 'text-green-100', label: 'ÓPTIMO' };
  if (temp <= 26) return { bg: 'bg-yellow-500', text: 'text-yellow-900', label: 'TEMPLADO' };
  return { bg: 'bg-red-600', text: 'text-red-100', label: 'CALIENTE' };
};

// Función para obtener color del estado del aireador
const getStateColor = (state: number, mode: string): { bg: string; border: string; glow: string } => {
  if (mode === 'off') return { bg: 'bg-slate-800', border: 'border-slate-600', glow: '' };
  if (state) return { bg: 'bg-green-900/30', border: 'border-green-500', glow: 'shadow-[0_0_15px_rgba(34,197,94,0.3)]' };
  return { bg: 'bg-slate-800/50', border: 'border-slate-700', glow: '' };
};

const HMIDashboard: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<HMIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Estados para modales y vistas
  const [selectedSilo, setSelectedSilo] = useState<Silo | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showChartModal, setShowChartModal] = useState(false);
  const [chartData, setChartData] = useState<any[]>([]);
  const [loadingChart, setLoadingChart] = useState(false);
  const [chartPeriod, setChartPeriod] = useState<'7d' | '30d'>('7d');
  
  // Estados para edición
  const [editValues, setEditValues] = useState({
    min_temperature: 0,
    max_temperature: 0,
    min_humidity: 0,
    max_humidity: 0,
    manual_mode: 'auto'
  });
  const [saving, setSaving] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Actualizar reloj cada minuto
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const response = await hmiApi.get(`/establishments/hmi/${token}`);
      setData(response.data);
      setError(null);
    } catch (err: any) {
      console.error('HMI: Error al cargar datos:', err);
      const errorMsg = err.response?.data?.error || err.message || 'Error de conexión';
      setError(`No se pudieron cargar los datos: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setError('No se proporcionó un token de acceso.');
      setLoading(false);
      return;
    }
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [token, fetchData]);

  // Cargar historial de un silo específico
  const loadSiloChart = async (silo: Silo) => {
    setSelectedSilo(silo);
    setShowChartModal(true);
    setLoadingChart(true);
    try {
      const res = await hmiApi.get(
        `/sensors/silo/${silo.id}/temperature-history`,
        { params: { hmi_token: token, days: chartPeriod === '7d' ? 7 : 30 } }
      );
      setChartData(res.data);
    } catch (err) {
      console.error('Error cargando historial:', err);
      setChartData([]);
    } finally {
      setLoadingChart(false);
    }
  };

  // Abrir modal de edición
  const openEditModal = (silo: Silo) => {
    setSelectedSilo(silo);
    setEditValues({
      min_temperature: silo.min_temperature,
      max_temperature: silo.max_temperature,
      min_humidity: silo.min_humidity,
      max_humidity: silo.max_humidity,
      manual_mode: silo.manual_mode
    });
    setShowEditModal(true);
  };

  // Guardar cambios
  const saveChanges = async () => {
    if (!selectedSilo) return;
    setSaving(true);
    try {
      await hmiApi.put(`/silos/${selectedSilo.id}/hmi`, editValues, {
        params: { hmi_token: token }
      });
      await fetchData();
      setShowEditModal(false);
    } catch (err) {
      console.error('Error guardando:', err);
      alert('Error al guardar los cambios');
    } finally {
      setSaving(false);
    }
  };

  // Pantalla de carga
  if (loading) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-16 h-16 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-xl text-slate-400">Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  // Pantalla de error
  if (error) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex items-center justify-center p-6">
        <div className="bg-red-900/20 border-2 border-red-500 rounded-3xl p-10 max-w-lg text-center">
          <AlertTriangle className="w-20 h-20 text-red-500 mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-white mb-4">Error</h1>
          <p className="text-xl text-slate-300 mb-8">{error}</p>
          <button 
            onClick={fetchData}
            className="flex items-center gap-3 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white px-10 py-5 rounded-2xl mx-auto text-xl font-bold transition-all"
          >
            <RefreshCw className="w-7 h-7" />
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-950 text-white flex flex-col overflow-hidden select-none" style={{ maxWidth: '1024px', maxHeight: '600px', margin: 'auto' }}>
      {/* Header compacto para 1024x600 */}
      <header className="bg-gradient-to-r from-slate-900 to-slate-800 px-3 py-2 flex items-center justify-between border-b border-slate-700 shrink-0">
        <h1 className="text-lg font-black text-white truncate">
          {data?.establishment.name}
        </h1>
        
        {/* Hora + Clima actual */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-700/50 px-3 py-1.5 rounded-lg border border-slate-600">
            <Clock className="w-5 h-5 text-slate-400" />
            <span className="text-xl font-black tabular-nums">
              {currentTime.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <div className="flex items-center gap-1 bg-orange-500/20 px-3 py-1.5 rounded-lg border border-orange-500/50">
            <Thermometer className="w-5 h-5 text-orange-400" />
            <span className="text-xl font-black">{data?.weather?.temperature?.toFixed(0) || '--'}°</span>
          </div>
          <div className="flex items-center gap-1 bg-blue-500/20 px-3 py-1.5 rounded-lg border border-blue-500/50">
            <Droplets className="w-5 h-5 text-blue-400" />
            <span className="text-xl font-black">{data?.weather?.humidity?.toFixed(0) || '--'}%</span>
          </div>
        </div>
      </header>

      {/* Grid de Silos - 4x2 para 8 silos en 1024x600 */}
      <main className="flex-1 p-2 bg-slate-950 overflow-hidden">
        <div className="grid grid-cols-4 grid-rows-2 gap-2 h-full">
          {data?.silos.map(silo => {
            const tempColor = getTempColor(silo.current_temp);
            const stateColor = getStateColor(silo.current_state, silo.manual_mode);
            
            return (
              <div 
                key={silo.id}
                className={`rounded-xl border-2 ${stateColor.border} ${stateColor.bg} ${stateColor.glow} p-2 flex flex-col transition-all overflow-hidden`}
              >
                {/* Fila 1: Nombre y Estado ON/OFF */}
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-base font-black truncate flex-1 pr-1">{silo.name}</h2>
                  <div className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-bold ${
                    silo.current_state ? 'bg-green-500 text-white' : 'bg-slate-700 text-slate-400'
                  }`}>
                    <Power className="w-3 h-3" />
                    {silo.current_state ? 'ON' : 'OFF'}
                  </div>
                </div>

                {/* Fila 2: Temperatura */}
                {silo.has_sensor_bar ? (
                  <button
                    onClick={() => loadSiloChart(silo)}
                    className={`${tempColor.bg} rounded-lg px-2 py-1 mb-1 flex items-center gap-1 active:scale-[0.98] transition-transform flex-1`}
                  >
                    <Thermometer className={`w-5 h-5 ${tempColor.text}`} />
                    <div className="text-left flex-1">
                      <p className={`text-xl font-black leading-none ${tempColor.text}`}>
                        {silo.current_temp?.toFixed(1) || '--'}°
                      </p>
                      <p className={`text-[9px] font-bold ${tempColor.text} opacity-80`}>{tempColor.label}</p>
                    </div>
                    <TrendingUp className={`w-4 h-4 ${tempColor.text} opacity-50`} />
                  </button>
                ) : (
                  <div className="flex-1 flex items-center justify-center bg-slate-800/30 rounded-lg mb-1">
                    <span className="text-slate-600 text-[10px]">Sin sensor</span>
                  </div>
                )}

                {/* Cuadrícula de estados 24h - 12x2 grid (ancho completo, 2 filas) */}
                <div className="grid grid-cols-12 grid-rows-2 gap-[2px] w-full mb-1" style={{ height: '16px' }}>
                  {(silo.next_24h_states || Array(24).fill(false)).map((isOn, idx) => (
                    <div
                      key={idx}
                      className={`rounded-[2px] ${isOn ? 'bg-green-500' : 'bg-red-500/70'}`}
                    />
                  ))}
                </div>

                {/* Fila 3: Modo + Razón de apagado */}
                <div className="flex items-center gap-1 mb-1">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${
                    silo.manual_mode === 'auto' ? 'bg-blue-600 text-white' :
                    silo.manual_mode === 'on' ? 'bg-green-600 text-white' :
                    silo.manual_mode === 'intelligent' ? 'bg-purple-600 text-white' :
                    'bg-red-600 text-white'
                  }`}>
                    {silo.manual_mode === 'intelligent' ? 'INT' : silo.manual_mode.toUpperCase()}
                  </span>
                  {silo.forced_off_reason && !silo.current_state && silo.manual_mode !== 'off' && (
                    <span className="text-[9px] bg-red-900/50 text-red-300 px-1.5 py-0.5 rounded truncate flex-1">
                      ⚠️ {silo.forced_off_reason.split(',')[0]}
                    </span>
                  )}
                </div>

                {/* Fila 4: Límites + Botón config */}
                <div className="flex items-center gap-1 mt-auto">
                  <div className="flex-1 bg-slate-800/50 rounded px-1.5 py-1 text-center">
                    <p className="text-[9px] text-slate-500 font-bold">T</p>
                    <p className="text-[11px] font-bold">{silo.min_temperature}°-{silo.max_temperature}°</p>
                  </div>
                  <div className="flex-1 bg-slate-800/50 rounded px-1.5 py-1 text-center">
                    <p className="text-[9px] text-slate-500 font-bold">H</p>
                    <p className="text-[11px] font-bold">{silo.min_humidity}%-{silo.max_humidity}%</p>
                  </div>
                  <button
                    onClick={() => openEditModal(silo)}
                    className="bg-slate-700 hover:bg-slate-600 active:bg-slate-500 p-2 rounded-lg transition-all"
                  >
                    <Settings className="w-5 h-5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Modal de Edición de Parámetros */}
      {showEditModal && selectedSilo && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 rounded-3xl w-full max-w-md border-2 border-slate-700 overflow-hidden">
            {/* Header del modal */}
            <div className="bg-slate-800 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-black">{selectedSilo.name}</h2>
              <button 
                onClick={() => setShowEditModal(false)}
                className="p-2 hover:bg-slate-700 rounded-xl"
              >
                <X className="w-8 h-8" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Modo de operación */}
              <div>
                <label className="text-lg font-bold text-slate-400 mb-3 block">Modo de Operación</label>
                <div className="grid grid-cols-4 gap-2">
                  {['auto', 'on', 'off', 'intelligent'].map(mode => (
                    <button
                      key={mode}
                      onClick={() => setEditValues(prev => ({ ...prev, manual_mode: mode }))}
                      className={`py-4 rounded-xl font-bold text-lg uppercase transition-all ${
                        editValues.manual_mode === mode
                          ? mode === 'auto' ? 'bg-blue-600 text-white' :
                            mode === 'on' ? 'bg-green-600 text-white' :
                            mode === 'off' ? 'bg-red-600 text-white' :
                            'bg-purple-600 text-white'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {mode === 'intelligent' ? 'INT' : mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Temperatura */}
              <div>
                <label className="text-lg font-bold text-slate-400 mb-3 block">Temperatura (°C)</label>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <p className="text-sm text-slate-500 mb-1">Mínima</p>
                    <input
                      type="number"
                      value={editValues.min_temperature}
                      onChange={e => setEditValues(prev => ({ ...prev, min_temperature: Number(e.target.value) }))}
                      className="w-full bg-slate-800 border-2 border-slate-700 rounded-xl px-4 py-4 text-2xl font-bold text-center focus:border-blue-500 outline-none"
                    />
                  </div>
                  <span className="text-3xl text-slate-600">—</span>
                  <div className="flex-1">
                    <p className="text-sm text-slate-500 mb-1">Máxima</p>
                    <input
                      type="number"
                      value={editValues.max_temperature}
                      onChange={e => setEditValues(prev => ({ ...prev, max_temperature: Number(e.target.value) }))}
                      className="w-full bg-slate-800 border-2 border-slate-700 rounded-xl px-4 py-4 text-2xl font-bold text-center focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Humedad */}
              <div>
                <label className="text-lg font-bold text-slate-400 mb-3 block">Humedad (%)</label>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <p className="text-sm text-slate-500 mb-1">Mínima</p>
                    <input
                      type="number"
                      value={editValues.min_humidity}
                      onChange={e => setEditValues(prev => ({ ...prev, min_humidity: Number(e.target.value) }))}
                      className="w-full bg-slate-800 border-2 border-slate-700 rounded-xl px-4 py-4 text-2xl font-bold text-center focus:border-blue-500 outline-none"
                    />
                  </div>
                  <span className="text-3xl text-slate-600">—</span>
                  <div className="flex-1">
                    <p className="text-sm text-slate-500 mb-1">Máxima</p>
                    <input
                      type="number"
                      value={editValues.max_humidity}
                      onChange={e => setEditValues(prev => ({ ...prev, max_humidity: Number(e.target.value) }))}
                      className="w-full bg-slate-800 border-2 border-slate-700 rounded-xl px-4 py-4 text-2xl font-bold text-center focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Botón guardar */}
              <button
                onClick={saveChanges}
                disabled={saving}
                className="w-full bg-green-600 hover:bg-green-500 active:bg-green-700 disabled:bg-slate-700 text-white py-5 rounded-2xl font-bold text-xl flex items-center justify-center gap-3 transition-all"
              >
                {saving ? (
                  <Loader2 className="w-7 h-7 animate-spin" />
                ) : (
                  <>
                    <Check className="w-7 h-7" />
                    Guardar Cambios
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Gráfico de Temperaturas */}
      {showChartModal && selectedSilo && (
        <div className="fixed inset-0 bg-black/90 flex flex-col z-50">
          {/* Header del gráfico */}
          <div className="bg-slate-900 px-4 py-3 flex items-center justify-between border-b border-slate-700">
            <button 
              onClick={() => setShowChartModal(false)}
              className="flex items-center gap-2 text-slate-400 hover:text-white"
            >
              <ChevronLeft className="w-8 h-8" />
              <span className="text-lg font-bold">Volver</span>
            </button>
            <h2 className="text-xl font-black">{selectedSilo.name}</h2>
            <div className="flex gap-2">
              <button
                onClick={() => { setChartPeriod('7d'); loadSiloChart(selectedSilo); }}
                className={`px-4 py-2 rounded-xl font-bold ${chartPeriod === '7d' ? 'bg-purple-600' : 'bg-slate-800'}`}
              >
                7 días
              </button>
              <button
                onClick={() => { setChartPeriod('30d'); loadSiloChart(selectedSilo); }}
                className={`px-4 py-2 rounded-xl font-bold ${chartPeriod === '30d' ? 'bg-purple-600' : 'bg-slate-800'}`}
              >
                30 días
              </button>
            </div>
          </div>

          {/* Gráfico */}
          <div className="flex-1 p-4">
            {loadingChart ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="w-16 h-16 text-purple-500 animate-spin" />
              </div>
            ) : chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500">
                <p className="text-xl">No hay datos disponibles</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis 
                    dataKey="timestamp" 
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                    tickFormatter={(val) => {
                      const d = new Date(val);
                      return `${d.getDate()}/${d.getMonth()+1}`;
                    }}
                  />
                  <YAxis 
                    domain={['auto', 'auto']}
                    tick={{ fill: '#94a3b8', fontSize: 14 }}
                    width={40}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1e293b', 
                      border: '1px solid #475569',
                      borderRadius: '12px',
                      fontSize: '14px'
                    }}
                    labelFormatter={(val) => new Date(val).toLocaleString()}
                  />
                  <ReferenceLine y={17} stroke="#3b82f6" strokeDasharray="5 5" label={{ value: 'Frío', fill: '#3b82f6', fontSize: 12 }} />
                  <ReferenceLine y={26} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'Caliente', fill: '#ef4444', fontSize: 12 }} />
                  {chartData.length > 0 && 
                    Object.keys(chartData[0])
                      .filter(k => k !== 'timestamp')
                      .map((key, idx) => (
                        <Line 
                          key={key}
                          type="monotone" 
                          dataKey={key} 
                          stroke={['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'][idx % 6]} 
                          strokeWidth={3} 
                          dot={false}
                          name={key}
                        />
                      ))
                  }
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default HMIDashboard;
