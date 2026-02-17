import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Layers } from 'lucide-react';
import { api } from '../api/client';
import { establishmentsApi, Establishment } from '../api/establishments';
import { silosApi, Silo } from '../api/silos';

interface TemperatureSensor {
  id: number;
  serial_number: string;
  description?: string;
}

interface SensorBar {
  id: number;
  name: string;
  establishment_id?: number;
  silo_id?: number;
  establishment_name?: string;
  silo_name?: string;
  sensors: Array<{
    position: number;
    sensor?: TemperatureSensor;
  }>;
}

interface SensorBarManagementProps {
  establishmentId: number | null;
}

export default function SensorBarManagement({ establishmentId }: SensorBarManagementProps) {
  const [bars, setBars] = useState<SensorBar[]>([]);
  const [availableSensors, setAvailableSensors] = useState<TemperatureSensor[]>([]);
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [silos, setSilos] = useState<Silo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBar, setEditingBar] = useState<SensorBar | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    establishment_id: establishmentId?.toString() || '',
    silo_id: '',
    sensors: {} as Record<string, number | null>
  });
  const [error, setError] = useState('');

  useEffect(() => {
    loadBars();
    loadAvailableSensors();
    loadInitialData();
  }, [establishmentId]);

  const loadInitialData = async () => {
    const token = localStorage.getItem('token') || '';
    try {
      const ests = await establishmentsApi.getAll(token);
      setEstablishments(ests);
      
      // Si hay un establecimiento seleccionado en el formulario, cargar sus silos
      if (formData.establishment_id) {
        const establishmentSilos = await silosApi.getByEstablishment(parseInt(formData.establishment_id), token);
        setSilos(establishmentSilos);
      }
    } catch (error) {
      console.error('Error al cargar datos iniciales:', error);
    }
  };

  const handleEstablishmentChange = async (estId: string) => {
    setFormData(prev => ({ ...prev, establishment_id: estId, silo_id: '' }));
    if (estId) {
      const token = localStorage.getItem('token') || '';
      try {
        const establishmentSilos = await silosApi.getByEstablishment(parseInt(estId), token);
        setSilos(establishmentSilos);
      } catch (error) {
        console.error('Error al cargar silos del establecimiento:', error);
      }
    } else {
      setSilos([]);
    }
  };

  const loadBars = async () => {
    try {
      const response = await api.get('/sensors/sensor-bars');
      // Filtrar por establecimiento seleccionado (si hay uno)
      const filteredBars = establishmentId 
        ? response.data.filter((bar: SensorBar) => bar.establishment_id === establishmentId)
        : response.data;
      setBars(filteredBars);
    } catch (error: any) {
      console.error('Error al cargar barras:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableSensors = async () => {
    try {
      const response = await api.get('/sensors/temperature-sensors/available');
      setAvailableSensors(response.data);
    } catch (error: any) {
      console.error('Error al cargar sensores disponibles:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const payload = {
        name: formData.name,
        establishment_id: formData.establishment_id || null,
        silo_id: formData.silo_id || null,
        sensors: formData.sensors
      };

      if (editingBar) {
        await api.put(`/sensors/sensor-bars/${editingBar.id}`, payload);
      } else {
        await api.post('/sensors/sensor-bars', payload);
      }

      setShowModal(false);
      resetForm();
      loadBars();
      loadAvailableSensors();
    } catch (error: any) {
      setError(error.response?.data?.error || 'Error al guardar barra');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Está seguro de eliminar esta barra de sensores?')) return;

    try {
      await api.delete(`/sensors/sensor-bars/${id}`);
      loadBars();
      loadAvailableSensors();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Error al eliminar barra');
    }
  };

  const openEditModal = async (bar: SensorBar) => {
    setEditingBar(bar);
    const sensors: Record<string, number | null> = {};
    for (let i = 1; i <= 8; i++) {
      const sensorKey = `sensor${i}_id`;
      const sensorData = bar.sensors.find(s => s.position === i);
      sensors[sensorKey] = sensorData?.sensor?.id || null;
    }
    
    // Primero establecemos el establishment_id para que handleEstablishmentChange cargue los silos
    const estId = bar.establishment_id?.toString() || '';
    setFormData({
      name: bar.name,
      establishment_id: estId,
      silo_id: bar.silo_id?.toString() || '',
      sensors
    });

    if (estId) {
      const token = localStorage.getItem('token') || '';
      try {
        const establishmentSilos = await silosApi.getByEstablishment(parseInt(estId), token);
        setSilos(establishmentSilos);
      } catch (error) {
        console.error('Error al cargar silos:', error);
      }
    }

    await loadAvailableSensors();
    setShowModal(true);
  };

  const openCreateModal = async () => {
    resetForm();
    setFormData(prev => ({ ...prev, establishment_id: establishmentId?.toString() || '' }));
    await loadAvailableSensors();
    setShowModal(true);
  };

  const resetForm = () => {
    setEditingBar(null);
    setFormData({
      name: '',
      establishment_id: '',
      silo_id: '',
      sensors: {}
    });
    setError('');
  };

  const handleSensorChange = (position: number, sensorId: string) => {
    setFormData({
      ...formData,
      sensors: {
        ...formData.sensors,
        [`sensor${position}_id`]: sensorId ? parseInt(sensorId) : null
      }
    });
  };

  if (loading) {
    return <div className="text-center py-8">Cargando barras de sensores...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 md:py-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 md:mb-6 gap-3">
        <div>
          <h2 className="text-xl md:text-3xl font-bold text-white flex items-center gap-2">
            <Layers className="w-6 h-6 md:w-8 md:h-8" />
            Barras de Sensores
          </h2>
          <p className="text-slate-400 text-xs md:text-sm mt-1">Gestión de conjuntos de hasta 8 sensores</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 w-full sm:w-auto text-sm md:text-base"
        >
          <Plus size={20} />
          Nueva Barra
        </button>
      </div>

      <div className="grid gap-4">
        {bars.length === 0 ? (
          <div className="bg-slate-800 border border-slate-700 rounded-lg shadow p-8 text-center text-slate-400">
            <Layers size={48} className="mx-auto mb-2 text-slate-500" />
            <p>No hay barras de sensores registradas</p>
          </div>
        ) : (
          bars.map((bar) => (
            <div key={bar.id} className="bg-slate-800 border border-slate-700 rounded-lg shadow-lg p-4 md:p-6">
              <div className="flex justify-between items-start mb-4 gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base md:text-xl font-bold text-white truncate">{bar.name}</h3>
                  <div className="mt-1 space-y-0.5">
                    {bar.silo_name && (
                      <p className="text-xs md:text-sm text-slate-400">Silo: {bar.silo_name}</p>
                    )}
                    {bar.establishment_name && (
                      <p className="text-xs md:text-sm text-slate-400">Establecimiento: {bar.establishment_name}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-1.5 md:gap-2 flex-shrink-0">
                  <button
                    onClick={() => openEditModal(bar)}
                    className="text-blue-400 hover:text-blue-300 p-2 rounded bg-slate-700 transition-colors"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(bar.id)}
                    className="text-red-400 hover:text-red-300 p-2 rounded bg-slate-700 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 md:gap-3">
                {bar.sensors.map((sensorSlot) => (
                  <div
                    key={sensorSlot.position}
                    className={`p-2 md:p-3 rounded border transition-all ${
                      sensorSlot.sensor
                        ? 'bg-blue-900/20 border-blue-600/50'
                        : 'bg-slate-700/30 border-slate-700'
                    }`}
                  >
                    <div className="text-[10px] md:text-xs font-medium text-slate-500 mb-1">
                      P{sensorSlot.position}
                    </div>
                    {sensorSlot.sensor ? (
                      <div className="min-w-0">
                        <div className="text-xs md:text-sm font-mono font-bold text-white truncate">
                          {sensorSlot.sensor.serial_number}
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px] md:text-xs text-slate-600 italic">Vacío</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 md:p-6 w-full max-w-3xl my-auto shadow-2xl">
            <h3 className="text-lg md:text-xl font-bold mb-4 text-white">
              {editingBar ? 'Editar Barra' : 'Nueva Barra'}
            </h3>

            {error && (
              <div className="bg-red-900/30 border border-red-600 text-red-200 px-4 py-3 rounded-lg mb-4 text-xs md:text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs md:text-sm font-medium text-slate-300 mb-1.5">
                    Nombre de la Barra *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 text-sm md:text-base"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs md:text-sm font-medium text-slate-300 mb-1.5">
                    Establecimiento *
                  </label>
                  <select
                    value={formData.establishment_id}
                    onChange={(e) => handleEstablishmentChange(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 text-sm md:text-base"
                    required
                  >
                    <option value="">Seleccionar...</option>
                    {establishments.map(est => (
                      <option key={est.id} value={est.id}>{est.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs md:text-sm font-medium text-slate-300 mb-1.5">
                    Silo *
                  </label>
                  <select
                    value={formData.silo_id}
                    onChange={(e) => setFormData({ ...formData, silo_id: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 text-sm md:text-base"
                    required
                    disabled={!formData.establishment_id}
                  >
                    <option value="">Seleccionar...</option>
                    {silos.map(silo => (
                      <option key={silo.id} value={silo.id}>{silo.name} (Pos: {silo.aerator_position})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="border-t border-slate-700 pt-4">
                <h4 className="text-sm md:text-base font-medium text-white mb-3">Asignación de Sensores</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((position) => (
                    <div key={position}>
                      <label className="block text-xs md:text-sm font-medium text-slate-400 mb-1">
                        Posición {position}
                      </label>
                      <select
                        value={formData.sensors[`sensor${position}_id`] || ''}
                        onChange={(e) => handleSensorChange(position, e.target.value)}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                      >
                        <option value="">Sin asignar</option>
                        {availableSensors.map((sensor) => (
                          <option key={sensor.id} value={sensor.id}>
                            {sensor.serial_number} {sensor.description ? `- ${sensor.description}` : ''}
                          </option>
                        ))}
                        {editingBar && editingBar.sensors.map((sensorSlot) => {
                          if (sensorSlot.sensor && !availableSensors.find(s => s.id === sensorSlot.sensor!.id)) {
                            return (
                              <option key={sensorSlot.sensor.id} value={sensorSlot.sensor.id}>
                                {sensorSlot.sensor.serial_number} {sensorSlot.sensor.description ? `- ${sensorSlot.sensor.description}` : ''} (asignado)
                              </option>
                            );
                          }
                          return null;
                        })}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-slate-700">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="flex-1 sm:flex-initial px-4 py-2.5 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-700 text-sm transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 sm:flex-initial px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold transition-colors"
                >
                  {editingBar ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
