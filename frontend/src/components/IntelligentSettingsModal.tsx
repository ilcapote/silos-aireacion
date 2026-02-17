import React, { useState, useEffect } from 'react';
import { X, Save, Thermometer, Droplets, Info } from 'lucide-react';
import { api } from '../api/client';

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

interface IntelligentSettingsModalProps {
  siloId: number;
  siloName: string;
  onClose: () => void;
  onSave: () => void;
}

export const IntelligentSettingsModal: React.FC<IntelligentSettingsModalProps> = ({
  siloId,
  siloName,
  onClose,
  onSave
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<IntelligentConfig>({
    grain_type: 'maiz',
    target_grain_moisture: 14.0,
    target_temp: 15.0,
    achieve_temperature: true,
    achieve_humidity: false,
    operation_type: 'dry',
    anti_condensation: true,
    delta_temp_min: 5.0,
    delta_temp_hyst: 2.0,
    delta_emc_min: 1.0,
    active: true
  });

  useEffect(() => {
    loadConfig();
  }, [siloId]);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/silos-management/${siloId}/intelligent-config`);
      if (response.data) {
        setConfig({
          ...response.data,
          achieve_temperature: !!response.data.achieve_temperature,
          achieve_humidity: !!response.data.achieve_humidity,
          anti_condensation: !!response.data.anti_condensation,
          active: !!response.data.active,
          operation_type: response.data.operation_type || 'dry'
        });
      }
    } catch (error) {
      console.error('Error loading intelligent config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await api.put(`/silos-management/${siloId}/intelligent-config`, config);
      onSave();
      onClose();
    } catch (error) {
      console.error('Error saving intelligent config:', error);
      alert('Error al guardar la configuración inteligente');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          <p className="text-slate-400 mt-4">Cargando configuración...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl shadow-2xl my-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div>
            <h3 className="text-xl font-bold text-white">Configuración Inteligente</h3>
            <p className="text-slate-400 text-sm">Silo: {siloName}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Tipo de Grano y Humedad Objetivo */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Tipo de Grano</label>
              <select
                value={config.grain_type}
                onChange={(e) => setConfig({ ...config, grain_type: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="maiz">Maíz</option>
                <option value="soja">Soja</option>
                <option value="trigo">Trigo</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Objetivo Principal</label>
              <select
                value={config.operation_type}
                onChange={(e) => setConfig({ ...config, operation_type: e.target.value as 'dry' | 'humidify' })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="dry">Secado (Extraer Humedad)</option>
                <option value="humidify">Humectación (Ganar Humedad)</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Humedad de Grano Objetivo (%)</label>
              <input
                type="number"
                step="0.1"
                value={config.target_grain_moisture}
                onChange={(e) => setConfig({ ...config, target_grain_moisture: parseFloat(e.target.value) })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="flex items-center gap-3 pt-8">
              <input
                id="anti_cond"
                type="checkbox"
                checked={config.anti_condensation}
                onChange={(e) => setConfig({ ...config, anti_condensation: e.target.checked })}
                className="w-5 h-5 rounded border-slate-700 text-amber-600 focus:ring-amber-500 bg-slate-900"
              />
              <label className="text-sm font-medium text-slate-300 cursor-pointer" htmlFor="anti_cond">
                Protección Anti-Condensación
              </label>
            </div>
          </div>

          <div className="h-px bg-slate-800"></div>

          {/* Prioridades */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Prioridades de Aireación</h4>
            
            {/* Alcanzar Temperatura */}
            <div className={`p-4 rounded-xl border transition-all ${config.achieve_temperature ? 'bg-blue-500/10 border-blue-500/50' : 'bg-slate-800/50 border-slate-700'}`}>
              <div className="flex items-start gap-4">
                <div className={`p-2 rounded-lg ${config.achieve_temperature ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-700 text-slate-500'}`}>
                  <Thermometer className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-white cursor-pointer select-none" htmlFor="achieve_temp">
                      Enfriamiento Automático
                    </label>
                    <input
                      id="achieve_temp"
                      type="checkbox"
                      checked={config.achieve_temperature}
                      onChange={(e) => setConfig({ ...config, achieve_temperature: e.target.checked })}
                      className="w-5 h-5 rounded border-slate-700 text-blue-600 focus:ring-blue-500 bg-slate-900"
                    />
                  </div>
                  <p className="text-slate-400 text-xs mt-1">Activa la aireación cuando el aire exterior es más frío que el grano.</p>
                  
                  {config.achieve_temperature && (
                    <div className="grid grid-cols-2 gap-4 mt-4 animate-in fade-in slide-in-from-top-2">
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-bold text-slate-500">Temp. Objetivo (°C)</label>
                        <input
                          type="number"
                          value={config.target_temp}
                          onChange={(e) => setConfig({ ...config, target_temp: parseFloat(e.target.value) })}
                          className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-bold text-slate-500">Diferencial Mín. (°C)</label>
                        <input
                          type="number"
                          value={config.delta_temp_min}
                          onChange={(e) => setConfig({ ...config, delta_temp_min: parseFloat(e.target.value) })}
                          className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Alcanzar Humedad (EMC) */}
            <div className={`p-4 rounded-xl border transition-all ${config.achieve_humidity ? 'bg-purple-500/10 border-purple-500/50' : 'bg-slate-800/50 border-slate-700'}`}>
              <div className="flex items-start gap-4">
                <div className={`p-2 rounded-lg ${config.achieve_humidity ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-700 text-slate-500'}`}>
                  <Droplets className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-white cursor-pointer select-none" htmlFor="achieve_hum">
                      Control de Humedad (EMC)
                    </label>
                    <input
                      id="achieve_hum"
                      type="checkbox"
                      checked={config.achieve_humidity}
                      onChange={(e) => setConfig({ ...config, achieve_humidity: e.target.checked })}
                      className="w-5 h-5 rounded border-slate-700 text-purple-600 focus:ring-purple-500 bg-slate-900"
                    />
                  </div>
                  <p className="text-slate-400 text-xs mt-1">Usa tablas de equilibrio para secar el grano sin sobresecarlo.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Info Note */}
          <div className="bg-slate-800/50 border border-slate-700 p-4 rounded-lg flex gap-3">
            <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-400 leading-relaxed">
              En modo inteligente, el sistema prioriza el enfriamiento. Si el enfriamiento no es necesario o no es posible, se evalúa si las condiciones de humedad son óptimas para el secado según el tipo de grano seleccionado.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-800 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {saving ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <Save className="w-4 h-4" />
            )}
            Guardar Configuración
          </button>
        </div>
      </div>
    </div>
  );
};
