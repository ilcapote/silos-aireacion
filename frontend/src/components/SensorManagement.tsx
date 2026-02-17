import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Thermometer } from 'lucide-react';
import { api } from '../api/client';

interface TemperatureSensor {
  id: number;
  serial_number: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export default function SensorManagement() {
  const [sensors, setSensors] = useState<TemperatureSensor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSensor, setEditingSensor] = useState<TemperatureSensor | null>(null);
  const [formData, setFormData] = useState({
    serial_number: '',
    description: ''
  });
  const [error, setError] = useState('');

  useEffect(() => {
    loadSensors();
  }, []);

  const loadSensors = async () => {
    console.log('Cargando sensores desde frontend...');
    try {
      const response = await api.get('/sensors/temperature-sensors');
      console.log('Sensores cargados:', response.data);
      setSensors(response.data);
    } catch (error: any) {
      console.error('Error al cargar sensores:', error);
      console.error('Detalles del error:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });
      setError(error.response?.data?.error || 'Error al cargar sensores');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    console.log('Enviando sensor:', { editingSensor, formData });

    try {
      if (editingSensor) {
        const res = await api.put(`/sensors/temperature-sensors/${editingSensor.id}`, formData);
        console.log('Respuesta actualización:', res.data);
      } else {
        const res = await api.post('/sensors/temperature-sensors', formData);
        console.log('Respuesta creación:', res.data);
      }

      setShowModal(false);
      setFormData({ serial_number: '', description: '' });
      setEditingSensor(null);
      loadSensors();
    } catch (error: any) {
      setError(error.response?.data?.error || 'Error al guardar sensor');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Está seguro de eliminar este sensor?')) return;

    try {
      await api.delete(`/sensors/temperature-sensors/${id}`);
      loadSensors();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Error al eliminar sensor');
    }
  };

  const openEditModal = (sensor: TemperatureSensor) => {
    setEditingSensor(sensor);
    setFormData({
      serial_number: sensor.serial_number,
      description: sensor.description || ''
    });
    setShowModal(true);
  };

  const openCreateModal = () => {
    setEditingSensor(null);
    setFormData({ serial_number: '', description: '' });
    setShowModal(true);
  };

  if (loading) {
    return <div className="text-center py-8">Cargando sensores...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 md:py-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 md:mb-6 gap-3">
        <div>
          <h2 className="text-xl md:text-3xl font-bold text-white flex items-center gap-2">
            <Thermometer className="w-6 h-6 md:w-8 md:h-8" />
            Sensores de Temperatura
          </h2>
          <p className="text-slate-400 text-xs md:text-sm mt-1">Gestión de sensores individuales</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 w-full sm:w-auto text-sm md:text-base"
        >
          <Plus size={20} />
          Nuevo Sensor
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-600 text-red-200 px-4 py-3 rounded-lg mb-4 text-xs md:text-sm">
          {error}
        </div>
      )}

      {/* Lista de sensores - Vista Mobile (Cards) */}
      <div className="grid grid-cols-1 gap-3 sm:hidden">
        {sensors.length === 0 ? (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center text-slate-400">
            <Thermometer size={48} className="mx-auto mb-2 text-slate-600" />
            <p>No hay sensores registrados</p>
          </div>
        ) : (
          sensors.map((sensor) => (
            <div key={sensor.id} className="bg-slate-800 border border-slate-700 rounded-lg p-4 shadow-md">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <Thermometer size={18} className="text-blue-500" />
                  <span className="font-mono font-bold text-white">{sensor.serial_number}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEditModal(sensor)}
                    className="text-blue-400 p-2 rounded bg-slate-700"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(sensor.id)}
                    className="text-red-400 p-2 rounded bg-slate-700"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="space-y-1 text-xs text-slate-400">
                <div className="flex justify-between">
                  <span>ID:</span>
                  <span>{sensor.id}</span>
                </div>
                {sensor.description && (
                  <div className="flex justify-between">
                    <span>Descripción:</span>
                    <span className="truncate max-w-[150px]">{sensor.description}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Creado:</span>
                  <span>{new Date(sensor.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Lista de sensores - Vista Desktop (Table) */}
      <div className="hidden sm:block bg-slate-800 border border-slate-700 rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-slate-700">
          <thead className="bg-slate-700/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Número de Serie</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Descripción</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Fecha Creación</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {sensors.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                  <Thermometer size={48} className="mx-auto mb-2 text-slate-600" />
                  <p>No hay sensores registrados</p>
                </td>
              </tr>
            ) : (
              sensors.map((sensor) => (
                <tr key={sensor.id} className="hover:bg-slate-700/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-white">{sensor.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Thermometer size={16} className="text-blue-500 mr-2" />
                      <span className="text-sm font-medium text-white font-mono">{sensor.serial_number}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">{sensor.description || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                    {new Date(sensor.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => openEditModal(sensor)}
                      className="text-blue-400 hover:text-blue-300 mr-3"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(sensor.id)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-bold mb-4">
              {editingSensor ? 'Editar Sensor' : 'Nuevo Sensor'}
            </h3>
            
            {error && (
              <div className="bg-red-900/30 border border-red-600 text-red-200 px-4 py-3 rounded mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Número de Serie *
                </label>
                <input
                  type="text"
                  value={formData.serial_number}
                  onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Descripción
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setError('');
                  }}
                  className="px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingSensor ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
