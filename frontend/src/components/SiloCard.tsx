import React, { useState } from 'react';
import { Power, AlertTriangle, CheckCircle, Edit2, Save, X, Clock } from 'lucide-react';
import { api } from '../api/client';

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
    current_temperature?: number;
    current_humidity?: number;
  };
  onUpdate: () => void;
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

export const SiloCard: React.FC<SiloCardProps> = ({ silo, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const siloColorIndex = (silo.id - 1) % siloColors.length;
  const siloColor = siloColors[siloColorIndex];
  const [formData, setFormData] = useState({
    max_temperature: silo.max_temperature,
    min_temperature: silo.min_temperature,
    max_humidity: silo.max_humidity,
    min_humidity: silo.min_humidity,
    peak_hours_shutdown: silo.peak_hours_shutdown ? 1 : 0,
    air_start_hour: silo.air_start_hour,
    air_end_hour: silo.air_end_hour || 6,
    use_sun_schedule: silo.use_sun_schedule || 0,
    manual_mode: silo.manual_mode || 'auto'
  });

  const getSiloStatusColor = () => {
    if (silo.manual_mode === 'off') return 'gray';
    if (silo.current_state) return 'green';
    if (silo.forced_off_reason) return 'red';
    return 'yellow';
  };

  const getSiloStatusText = () => {
    if (silo.manual_mode === 'off') return 'Deshabilitado';
    if (silo.current_state) return 'Aireador Encendido';
    if (silo.forced_off_reason) return `Apagado: ${silo.forced_off_reason}`;
    return 'Aireador Apagado';
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

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.put(`/silos-management/${silo.id}`, {
        name: silo.name,
        establishment_id: silo.establishment_id,
        aerator_position: silo.aerator_position,
        min_temperature: formData.min_temperature,
        max_temperature: formData.max_temperature,
        min_humidity: formData.min_humidity,
        max_humidity: formData.max_humidity,
        peak_hours_shutdown: formData.peak_hours_shutdown,
        air_start_hour: formData.air_start_hour,
        air_end_hour: formData.air_end_hour,
        use_sun_schedule: formData.use_sun_schedule,
        manual_mode: formData.manual_mode
      });
      setIsEditing(false);
      onUpdate();
    } catch (error) {
      console.error('Error al guardar cambios:', error);
      alert('Error al guardar los cambios');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      max_temperature: silo.max_temperature,
      min_temperature: silo.min_temperature,
      max_humidity: silo.max_humidity,
      min_humidity: silo.min_humidity,
      peak_hours_shutdown: silo.peak_hours_shutdown ? 1 : 0,
      air_start_hour: silo.air_start_hour,
      air_end_hour: silo.air_end_hour || 6,
      use_sun_schedule: silo.use_sun_schedule || 0,
      manual_mode: silo.manual_mode || 'auto'
    });
    setIsEditing(false);
  };

  const statusColor = getSiloStatusColor();
  const colors = getColorClasses(statusColor);
  const statusText = getSiloStatusText();

  return (
    <div className={`${colors.bg} ${siloColor.bg} border-2 ${colors.border} ${siloColor.border} rounded-lg shadow-lg p-6 transition-all hover:shadow-xl backdrop-blur-sm`}>
      {/* Header del Silo */}
      <div className="flex items-center justify-between mb-4">
        <h4 className={`text-lg font-bold ${siloColor.title} ${siloColor.bg} ${siloColor.border} border px-3 py-1.5 rounded-lg`}>{silo.name}</h4>
        <div className="flex items-center gap-2">
          <div className={`px-3 py-1 rounded-full text-xs font-semibold ${colors.badge}`}>
            {statusText}
          </div>
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="p-2 hover:bg-slate-700/50 rounded-lg transition"
              title="Editar parámetros"
            >
              <Edit2 className="w-4 h-4 text-gray-600" />
            </button>
          ) : (
            <div className="flex gap-1">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="p-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition disabled:opacity-50"
                title="Guardar cambios"
              >
                <Save className="w-4 h-4" />
              </button>
              <button
                onClick={handleCancel}
                disabled={isSaving}
                className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition disabled:opacity-50"
                title="Cancelar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Estado del Aireador */}
      <div className="mb-4 pb-4 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-300">Aireador</span>
          <div className="flex items-center gap-2">
            {silo.current_state ? (
              <>
                <Power className="w-4 h-4 text-green-400" />
                <span className="text-sm font-semibold text-green-400">Encendido</span>
              </>
            ) : (
              <>
                <Power className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-semibold text-slate-500">Apagado</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Datos Actuales */}
      <div className="space-y-3 mb-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-slate-400">Temperatura Actual</span>
            <span className="text-lg font-bold text-white">
              {silo.current_temperature?.toFixed(1)}°C
            </span>
          </div>
          {isEditing ? (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className="text-xs text-slate-400">T Min (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.min_temperature}
                  onChange={(e) => setFormData({...formData, min_temperature: parseFloat(e.target.value)})}
                  className="w-full px-2 py-1 bg-slate-700 border border-slate-600 text-white rounded text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">T Max (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.max_temperature}
                  onChange={(e) => setFormData({...formData, max_temperature: parseFloat(e.target.value)})}
                  className="w-full px-2 py-1 bg-slate-700 border border-slate-600 text-white rounded text-sm"
                />
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500">
              Rango: {silo.min_temperature}°C - {silo.max_temperature}°C
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-slate-400">Humedad Actual</span>
            <span className="text-lg font-bold text-white">
              {silo.current_humidity?.toFixed(0)}%
            </span>
          </div>
          {isEditing ? (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className="text-xs text-slate-400">H Min (%)</label>
                <input
                  type="number"
                  step="1"
                  value={formData.min_humidity}
                  onChange={(e) => setFormData({...formData, min_humidity: parseFloat(e.target.value)})}
                  className="w-full px-2 py-1 bg-slate-700 border border-slate-600 text-white rounded text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">H Max (%)</label>
                <input
                  type="number"
                  step="1"
                  value={formData.max_humidity}
                  onChange={(e) => setFormData({...formData, max_humidity: parseFloat(e.target.value)})}
                  className="w-full px-2 py-1 bg-slate-700 border border-slate-600 text-white rounded text-sm"
                />
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500">
              Rango: {silo.min_humidity}% - {silo.max_humidity}%
            </div>
          )}
        </div>
      </div>

      {/* Restricción Horaria */}
      {isEditing && (
        <div className="space-y-3 mb-4 pt-4 border-t border-slate-700">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-300">Restricción Horaria</span>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-400">Hora Inicio</label>
              <input
                type="number"
                min="0"
                max="23"
                value={formData.air_start_hour}
                onChange={(e) => setFormData({...formData, air_start_hour: parseInt(e.target.value)})}
                className="w-full px-2 py-1 bg-slate-700 border border-slate-600 text-white rounded text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400">Hora Fin</label>
              <input
                type="number"
                min="0"
                max="23"
                value={formData.air_end_hour}
                onChange={(e) => setFormData({...formData, air_end_hour: parseInt(e.target.value)})}
                className="w-full px-2 py-1 bg-slate-700 border border-slate-600 text-white rounded text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={formData.peak_hours_shutdown === 1}
                onChange={(e) => setFormData({...formData, peak_hours_shutdown: e.target.checked ? 1 : 0})}
                className="rounded"
              />
              <span className="text-slate-300">Apagar en horas pico</span>
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={formData.use_sun_schedule === 1}
                onChange={(e) => setFormData({...formData, use_sun_schedule: e.target.checked ? 1 : 0})}
                className="rounded"
              />
              <span className="text-slate-300">Usar horario solar</span>
            </label>
          </div>

          <div>
            <label className="text-xs text-slate-400">Modo Manual</label>
            <select
              value={formData.manual_mode}
              onChange={(e) => setFormData({...formData, manual_mode: e.target.value})}
              className="w-full px-2 py-1 bg-slate-700 border border-slate-600 text-white rounded text-sm"
            >
              <option value="auto">Automático</option>
              <option value="on">Siempre Encendido</option>
              <option value="off">Siempre Apagado</option>
            </select>
          </div>
        </div>
      )}

      {/* Indicadores */}
      {!isEditing && (
        <div className="flex gap-2">
          {silo.current_temperature! >= silo.min_temperature && 
           silo.current_temperature! <= silo.max_temperature ? (
            <div className="flex items-center gap-1 text-green-600 text-xs">
              <CheckCircle className="w-4 h-4" />
              <span>Temp OK</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-red-600 text-xs">
              <AlertTriangle className="w-4 h-4" />
              <span>Temp Alerta</span>
            </div>
          )}

          {silo.current_humidity! >= silo.min_humidity && 
           silo.current_humidity! <= silo.max_humidity ? (
            <div className="flex items-center gap-1 text-green-600 text-xs">
              <CheckCircle className="w-4 h-4" />
              <span>Hum OK</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-red-600 text-xs">
              <AlertTriangle className="w-4 h-4" />
              <span>Hum Alerta</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
