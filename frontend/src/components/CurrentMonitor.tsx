import { useState, useEffect, useCallback } from 'react';
import { Zap, Building2, RefreshCw, ChevronDown, Save, AlertTriangle, CheckCircle } from 'lucide-react';
import { api } from '../api/client';
import { establishmentsApi, Establishment } from '../api/establishments';

interface CurrentReading {
  corriente: number;
  updated_at: string;
  max_corriente: number | null;
}

interface CurrentMonitorProps {
  establishmentId: number | null;
}

function timeSince(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)    return `hace ${diff}s`;
  if (diff < 3600)  return `hace ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
  return `hace ${Math.floor(diff / 86400)}d`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export default function CurrentMonitor({ establishmentId }: CurrentMonitorProps) {
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [selectedEst, setSelectedEst] = useState<Establishment | null>(null);
  const [reading, setReading] = useState<CurrentReading | null>(null);
  const [loadingEst, setLoadingEst] = useState(true);
  const [loadingReading, setLoadingReading] = useState(false);
  const [error, setError] = useState('');
  const [saveMsg, setSaveMsg] = useState('');
  const [saving, setSaving] = useState(false);

  // Formulario de configuración
  const [formMaxCurrent, setFormMaxCurrent] = useState('');
  const [formSensorId, setFormSensorId] = useState('');

  const token = localStorage.getItem('token') || '';

  const loadEstablishments = useCallback(async () => {
    try {
      setLoadingEst(true);
      const data = await establishmentsApi.getAll(token);
      setEstablishments(data);
      // Seleccionar el que viene por prop, o el primero
      const initial = establishmentId
        ? data.find(e => e.id === establishmentId) ?? data[0]
        : data[0];
      if (initial) {
        setSelectedEst(initial);
        setFormMaxCurrent(initial.max_operating_current?.toString() ?? '');
        setFormSensorId(initial.current_sensor_id ?? '');
      }
    } catch {
      setError('Error al cargar establecimientos');
    } finally {
      setLoadingEst(false);
    }
  }, [token, establishmentId]);

  const loadReading = useCallback(async (sensorId: string) => {
    if (!sensorId) {
      setReading(null);
      return;
    }
    try {
      setLoadingReading(true);
      const res = await api.get(`/corriente?device_id=${encodeURIComponent(sensorId)}`);
      setReading(res.data);
      setError('');
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setReading(null);
      } else {
        setError('Error al cargar lectura de corriente');
      }
    } finally {
      setLoadingReading(false);
    }
  }, []);

  useEffect(() => { loadEstablishments(); }, [loadEstablishments]);

  useEffect(() => {
    if (selectedEst?.current_sensor_id) {
      loadReading(selectedEst.current_sensor_id);
    } else {
      setReading(null);
    }
  }, [selectedEst, loadReading]);

  // Auto-refresh cada 15 segundos
  useEffect(() => {
    if (!selectedEst?.current_sensor_id) return;
    const interval = setInterval(() => {
      loadReading(selectedEst.current_sensor_id!);
    }, 15000);
    return () => clearInterval(interval);
  }, [selectedEst, loadReading]);

  const handleEstChange = (id: number) => {
    const est = establishments.find(e => e.id === id) ?? null;
    setSelectedEst(est);
    setFormMaxCurrent(est?.max_operating_current?.toString() ?? '');
    setFormSensorId(est?.current_sensor_id ?? '');
    setReading(null);
    setSaveMsg('');
    setError('');
  };

  const handleSave = async () => {
    if (!selectedEst) return;
    try {
      setSaving(true);
      setSaveMsg('');
      const res = await api.patch(`/establishments/${selectedEst.id}/current-settings`, {
        max_operating_current: formMaxCurrent ? parseFloat(formMaxCurrent) : null,
        current_sensor_id: formSensorId.trim() || null,
      });
      const updated: Establishment = res.data.establishment;
      setEstablishments(prev => prev.map(e => e.id === updated.id ? updated : e));
      setSelectedEst(updated);
      setSaveMsg('Configuración guardada correctamente');
      if (updated.current_sensor_id) loadReading(updated.current_sensor_id);
      else setReading(null);
    } catch {
      setSaveMsg('Error al guardar la configuración');
    } finally {
      setSaving(false);
    }
  };

  // Calcular porcentaje de uso
  const usagePercent = reading && reading.max_corriente && reading.max_corriente > 0
    ? Math.min((reading.corriente / reading.max_corriente) * 100, 100)
    : null;

  const usageColor = usagePercent === null
    ? 'bg-slate-600'
    : usagePercent >= 90 ? 'bg-red-500'
    : usagePercent >= 70 ? 'bg-yellow-500'
    : 'bg-green-500';

  const hasSensor = !!selectedEst?.current_sensor_id;

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 md:py-8">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 md:mb-6 gap-3">
        <h1 className="text-xl md:text-3xl font-bold flex items-center gap-2 text-white">
          <Zap className="w-6 h-6 md:w-8 md:h-8 text-yellow-400" />
          Monitor de Corriente
        </h1>
        <button
          onClick={() => { if (selectedEst?.current_sensor_id) loadReading(selectedEst.current_sensor_id); }}
          disabled={!hasSensor || loadingReading}
          className="flex items-center gap-2 px-3 md:px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 rounded-lg transition text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loadingReading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-600 text-red-200 px-4 py-3 rounded-lg mb-4 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Selector de establecimiento */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-5">
        <label className="text-xs text-slate-400 font-medium flex items-center gap-1 mb-2">
          <Building2 className="w-3.5 h-3.5" /> Establecimiento
        </label>
        {loadingEst ? (
          <div className="h-10 bg-slate-700 rounded-lg animate-pulse" />
        ) : (
          <div className="relative">
            <select
              value={selectedEst?.id ?? ''}
              onChange={(e) => handleEstChange(parseInt(e.target.value))}
              className="w-full pl-3 pr-8 py-2.5 bg-slate-700 border border-slate-600 text-white text-sm rounded-lg appearance-none focus:ring-2 focus:ring-yellow-500 outline-none"
            >
              {establishments.map(est => (
                <option key={est.id} value={est.id}>{est.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
        {/* Panel de lectura actual */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            Lectura Actual
          </h2>

          {!hasSensor ? (
            <div className="text-center py-8">
              <AlertTriangle className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">Este establecimiento no tiene sensor de corriente configurado.</p>
              <p className="text-slate-500 text-xs mt-1">Configuralo en el panel de la derecha.</p>
            </div>
          ) : loadingReading && !reading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500"></div>
            </div>
          ) : reading ? (
            <div className="space-y-4">
              {/* Valor grande */}
              <div className="text-center py-4">
                <div className={`text-5xl font-bold ${
                  usagePercent !== null && usagePercent >= 90 ? 'text-red-400' :
                  usagePercent !== null && usagePercent >= 70 ? 'text-yellow-400' : 'text-green-400'
                }`}>
                  {reading.corriente.toFixed(2)}
                  <span className="text-2xl text-slate-400 ml-1">A</span>
                </div>
                {reading.max_corriente && (
                  <div className="text-slate-400 text-sm mt-1">
                    de {reading.max_corriente} A máximo
                  </div>
                )}
              </div>

              {/* Barra de progreso */}
              {usagePercent !== null && (
                <div>
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>Uso</span>
                    <span>{usagePercent.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all duration-500 ${usageColor}`}
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                  {usagePercent >= 90 && (
                    <p className="text-red-400 text-xs mt-1.5 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Corriente cerca del límite máximo
                    </p>
                  )}
                </div>
              )}

              {/* Timestamp */}
              <div className="border-t border-slate-700 pt-3 text-xs text-slate-500 space-y-0.5">
                <div>Última actualización: <span className="text-slate-400">{timeSince(reading.updated_at)}</span></div>
                <div>{formatDate(reading.updated_at)}</div>
                <div className="text-slate-600">Sensor: <span className="font-mono">{selectedEst?.current_sensor_id}</span></div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-slate-400 text-sm">Sin datos de corriente.</p>
              <p className="text-slate-500 text-xs mt-1">El sensor aún no ha enviado ningún valor.</p>
            </div>
          )}
        </div>

        {/* Panel de configuración */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-400" />
            Configuración de Protección
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">
                ID del Sensor de Corriente
              </label>
              <input
                type="text"
                value={formSensorId}
                onChange={(e) => setFormSensorId(e.target.value)}
                placeholder="Ej: sensor_01 (vacío para desactivar)"
                className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 text-white text-sm rounded-lg focus:ring-2 focus:ring-yellow-500 outline-none placeholder-slate-500"
              />
              <p className="text-xs text-slate-500 mt-1">Debe coincidir con el ID configurado en el ESP32.</p>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">
                Corriente Máxima Permitida (A)
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={formMaxCurrent}
                onChange={(e) => setFormMaxCurrent(e.target.value)}
                placeholder="Ej: 30 (vacío para sin límite)"
                className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 text-white text-sm rounded-lg focus:ring-2 focus:ring-yellow-500 outline-none placeholder-slate-500"
              />
              <p className="text-xs text-slate-500 mt-1">
                Si la corriente actual + 6A (por aireador) supera este valor, el aireador no se encenderá.
              </p>
            </div>

            <button
              onClick={handleSave}
              disabled={saving || !selectedEst}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white font-medium text-sm rounded-lg transition"
            >
              {saving ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saving ? 'Guardando...' : 'Guardar Configuración'}
            </button>

            {saveMsg && (
              <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
                saveMsg.includes('Error')
                  ? 'bg-red-900/30 border border-red-700 text-red-300'
                  : 'bg-green-900/30 border border-green-700 text-green-300'
              }`}>
                {saveMsg.includes('Error')
                  ? <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  : <CheckCircle className="w-4 h-4 flex-shrink-0" />
                }
                {saveMsg}
              </div>
            )}

            {/* Info de protección */}
            <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-3 text-xs text-slate-400 space-y-1">
              <p className="font-medium text-slate-300">¿Cómo funciona la protección?</p>
              <p>El ESP32 consulta la corriente actual antes de encender cada aireador.</p>
              <p>Si <span className="text-yellow-400">corriente actual + 6A</span> supera el máximo configurado, el aireador no se enciende.</p>
              <p>El servidor también aplica esta restricción al calcular los estados de las próximas 24h.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
