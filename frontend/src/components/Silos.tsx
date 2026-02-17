import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { silosApi, Silo, CreateSiloData } from '../api/silos';
import { establishmentsApi, Establishment } from '../api/establishments';
import { Container, Plus, Edit, Trash2, Building2, Thermometer, Droplets, Clock, Wind } from 'lucide-react';

interface SilosProps {
  establishmentId: number | null;
}

export default function Silos({ establishmentId }: SilosProps) {
  const { isAuthenticated } = useAuth();
  const [silos, setSilos] = useState<Silo[]>([]);
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [availablePositions, setAvailablePositions] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<CreateSiloData>({
    name: '',
    establishment_id: establishmentId || 0,
    aerator_position: 1,
    min_temperature: 10.0,
    max_temperature: 25.0,
    min_humidity: 40.0,
    max_humidity: 70.0,
    peak_hours_shutdown: false,
    air_start_hour: 22,
    air_end_hour: 6,
    use_sun_schedule: false
  });

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated, establishmentId]);

  const getToken = () => localStorage.getItem('token') || '';

  const loadData = async () => {
    const token = getToken();
    if (!token) return;

    try {
      setLoading(true);
      const [silosData, establishmentsData] = await Promise.all([
        silosApi.getAll(token),
        establishmentsApi.getAll(token)
      ]);
      
      // Filtrar silos por establecimiento seleccionado (si hay uno)
      const filteredSilos = establishmentId 
        ? silosData.filter(silo => silo.establishment_id === establishmentId)
        : silosData;
        
      setSilos(filteredSilos);
      setEstablishments(establishmentsData);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailablePositions = async (establishmentId: number, excludeSiloId?: number) => {
    const token = getToken();
    if (!token || !establishmentId) return;

    try {
      const positions = await silosApi.getAvailablePositions(establishmentId, token, excludeSiloId);
      setAvailablePositions(positions);
      
      // Si la posición actual no está en la lista de disponibles, seleccionar la primera
      if (positions.length > 0 && !positions.includes(formData.aerator_position)) {
        setFormData(prev => ({ ...prev, aerator_position: positions[0] }));
      }
    } catch (err: any) {
      console.error('Error al cargar posiciones disponibles:', err);
    }
  };

  const handleEstablishmentChange = (establishmentId: number) => {
    setFormData(prev => ({ 
      ...prev, 
      establishment_id: establishmentId || (establishments.length > 0 ? establishments[0].id : 0),
      aerator_position: 1 
    }));
    // Si estamos editando, excluir el silo actual de las posiciones ocupadas
    loadAvailablePositions(establishmentId, editingId || undefined);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getToken();
    if (!token) return;

    try {
      if (editingId) {
        await silosApi.update(editingId, formData, token);
      } else {
        await silosApi.create(formData, token);
      }

      await loadData();
      resetForm();
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al guardar silo');
    }
  };

  const handleEdit = (silo: Silo) => {
    setFormData({
      name: silo.name,
      establishment_id: silo.establishment_id,
      aerator_position: silo.aerator_position,
      min_temperature: silo.min_temperature,
      max_temperature: silo.max_temperature,
      min_humidity: silo.min_humidity,
      max_humidity: silo.max_humidity,
      peak_hours_shutdown: silo.peak_hours_shutdown === 1,
      air_start_hour: silo.air_start_hour,
      air_end_hour: silo.air_end_hour,
      use_sun_schedule: silo.use_sun_schedule === 1
    });
    setEditingId(silo.id);
    setShowForm(true);
    // Cargar posiciones disponibles excluyendo el silo actual
    loadAvailablePositions(silo.establishment_id, silo.id);
  };

  const handleDelete = async (id: number) => {
    const token = getToken();
    if (!token) return;
    if (!confirm('¿Estás seguro de eliminar este silo?')) return;

    try {
      await silosApi.delete(id, token);
      await loadData();
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al eliminar silo');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      establishment_id: establishmentId || (establishments.length > 0 ? establishments[0].id : 0),
      aerator_position: 1,
      min_temperature: 10.0,
      max_temperature: 25.0,
      min_humidity: 40.0,
      max_humidity: 70.0,
      peak_hours_shutdown: false,
      air_start_hour: 22,
      air_end_hour: 6,
      use_sun_schedule: false
    });
    setEditingId(null);
    setShowForm(false);
    setAvailablePositions([]);
  };

  const getModeColor = (mode: string) => {
    switch (mode) {
      case 'on':
        return 'bg-green-100 text-green-800';
      case 'off':
        return 'bg-red-100 text-red-800';
      case 'auto':
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  const getModeText = (mode: string) => {
    switch (mode) {
      case 'on':
        return 'Encendido';
      case 'off':
        return 'Apagado';
      case 'auto':
      default:
        return 'Automático';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Container className="w-8 h-8" />
          Gestión de Silos
        </h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Nuevo Silo
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {showForm && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">
            {editingId ? 'Editar Silo' : 'Nuevo Silo'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nombre *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Establecimiento *</label>
                <select
                  value={formData.establishment_id}
                  onChange={(e) => handleEstablishmentChange(parseInt(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value={0}>Seleccione un establecimiento</option>
                  {establishments.map((est) => (
                    <option key={est.id} value={est.id}>
                      {est.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Posición del Aireador (1-8) *</label>
                <select
                  value={formData.aerator_position}
                  onChange={(e) => setFormData({ ...formData, aerator_position: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                  disabled={!formData.establishment_id}
                >
                  {availablePositions.length > 0 ? (
                    availablePositions.map((pos) => (
                      <option key={pos} value={pos}>
                        Posición {pos}
                      </option>
                    ))
                  ) : (
                    <option value="">Seleccione establecimiento primero</option>
                  )}
                </select>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="font-semibold mb-3">Parámetros de Temperatura (°C)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Temperatura Mínima *</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.min_temperature}
                    onChange={(e) => setFormData({ ...formData, min_temperature: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Temperatura Máxima *</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.max_temperature}
                    onChange={(e) => setFormData({ ...formData, max_temperature: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="font-semibold mb-3">Parámetros de Humedad (%)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Humedad Mínima *</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.min_humidity}
                    onChange={(e) => setFormData({ ...formData, min_humidity: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Humedad Máxima *</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.max_humidity}
                    onChange={(e) => setFormData({ ...formData, max_humidity: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="font-semibold mb-3">Configuración de Aireación</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Hora de Inicio (0-23)</label>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={formData.air_start_hour}
                    onChange={(e) => setFormData({ ...formData, air_start_hour: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Hora de Fin (0-23)</label>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={formData.air_end_hour}
                    onChange={(e) => setFormData({ ...formData, air_end_hour: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>
              <div className="mt-3 space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.peak_hours_shutdown}
                    onChange={(e) => setFormData({ ...formData, peak_hours_shutdown: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Apagar en horas pico</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.use_sun_schedule}
                    onChange={(e) => setFormData({ ...formData, use_sun_schedule: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Usar horario basado en horas de sol</span>
                </label>
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <button
                type="submit"
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                {editingId ? 'Actualizar' : 'Crear'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="bg-slate-700 text-slate-300 px-4 py-2 rounded-lg hover:bg-slate-600"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {silos.map((silo) => (
          <div key={silo.id} className="bg-slate-800 border border-slate-700 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-2">
                <Container className="w-6 h-6 text-blue-600" />
                <h3 className="text-lg font-semibold">{silo.name}</h3>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleEdit(silo)}
                  className="text-blue-400 hover:text-blue-300"
                >
                  <Edit className="w-5 h-5" />
                </button>
                <button
                  onClick={() => handleDelete(silo.id)}
                  className="text-red-400 hover:text-red-300"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-slate-400">
                <Building2 className="w-4 h-4" />
                <span className="truncate">{silo.establishment_name || `ID: ${silo.establishment_id}`}</span>
              </div>

              <div className="flex items-center gap-2 text-slate-400">
                <Wind className="w-4 h-4" />
                <span>Posición: {silo.aerator_position}</span>
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <span className="text-slate-400">Modo:</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getModeColor(silo.manual_mode)}`}>
                  {getModeText(silo.manual_mode)}
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Thermometer className="w-3 h-3" />
                <span>{silo.min_temperature}°C - {silo.max_temperature}°C</span>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Droplets className="w-3 h-3" />
                <span>{silo.min_humidity}% - {silo.max_humidity}%</span>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Clock className="w-3 h-3" />
                <span>Aireación: {silo.air_start_hour}:00 - {silo.air_end_hour}:00</span>
              </div>

              {silo.peak_hours_shutdown === 1 && (
                <div className="text-xs text-orange-600 font-medium">
                  ⚡ Apagado en horas pico
                </div>
              )}

              {silo.use_sun_schedule === 1 && (
                <div className="text-xs text-yellow-600 font-medium">
                  ☀️ Horario solar
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {silos.length === 0 && !showForm && (
        <div className="text-center py-12 text-slate-400">
          No hay silos registrados. Haz clic en "Nuevo Silo" para crear uno.
        </div>
      )}
    </div>
  );
}
