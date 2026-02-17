import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { establishmentsApi, Establishment, CreateEstablishmentData } from '../api/establishments';
import { Building2, Plus, Edit, Trash2, MapPin, User, Key, ExternalLink, Copy, Check } from 'lucide-react';

export default function Establishments() {
  const { isAuthenticated } = useAuth();
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<CreateEstablishmentData>({
    name: '',
    owner: '',
    latitude: 0,
    longitude: 0,
    max_operating_current: undefined,
    current_sensor_id: ''
  });
  const [copiedId, setCopiedId] = useState<number | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      loadEstablishments();
    }
  }, [isAuthenticated]);

  const getToken = () => localStorage.getItem('token') || '';

  const loadEstablishments = async () => {
    const token = getToken();
    console.log('=== Cargando establecimientos ===');
    console.log('Token presente:', !!token);
    if (!token) {
      console.log('No hay token, abortando');
      return;
    }
    
    try {
      setLoading(true);
      console.log('Llamando a establishmentsApi.getAll...');
      const data = await establishmentsApi.getAll(token);
      console.log('Establecimientos recibidos:', data.length);
      setEstablishments(data);
      setError('');
    } catch (err: any) {
      console.error('Error al cargar establecimientos:', err);
      console.error('Response:', err.response?.data);
      setError(err.response?.data?.error || 'Error al cargar establecimientos');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getToken();
    if (!token) return;

    try {
      if (editingId) {
        await establishmentsApi.update(editingId, formData, token);
      } else {
        await establishmentsApi.create(formData, token);
      }
      
      await loadEstablishments();
      resetForm();
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al guardar establecimiento');
    }
  };

  const handleEdit = (establishment: Establishment) => {
    setFormData({
      name: establishment.name,
      owner: establishment.owner,
      latitude: establishment.latitude,
      longitude: establishment.longitude,
      max_operating_current: establishment.max_operating_current,
      current_sensor_id: establishment.current_sensor_id || ''
    });
    setEditingId(establishment.id);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    const token = getToken();
    if (!token) return;
    if (!confirm('¿Estás seguro de eliminar este establecimiento?')) return;

    try {
      await establishmentsApi.delete(id, token);
      await loadEstablishments();
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al eliminar establecimiento');
    }
  };

  const handleGenerateToken = async (id: number) => {
    const token = getToken();
    if (!token) return;

    try {
      await establishmentsApi.generateHMIToken(id, token);
      await loadEstablishments();
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al generar token HMI');
    }
  };

  const copyHMILink = (token: string, id: number) => {
    const url = `${window.location.origin}/hmi/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      owner: '',
      latitude: 0,
      longitude: 0,
      max_operating_current: undefined,
      current_sensor_id: ''
    });
    setEditingId(null);
    setShowForm(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 md:py-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 md:mb-6 gap-3">
        <h1 className="text-xl md:text-3xl font-bold flex items-center gap-2 text-white">
          <Building2 className="w-6 h-6 md:w-8 md:h-8" />
          Gestión de Establecimientos
        </h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-3 md:px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm md:text-base w-full sm:w-auto justify-center"
        >
          <Plus className="w-4 h-4 md:w-5 md:h-5" />
          Nuevo Establecimiento
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-600 text-red-200 px-3 md:px-4 py-2.5 md:py-3 rounded mb-4 text-xs md:text-sm">
          {error}
        </div>
      )}

      {showForm && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-lg p-4 md:p-6 mb-4 md:mb-6">
          <h2 className="text-lg md:text-xl font-semibold text-white mb-3 md:mb-4">
            {editingId ? 'Editar Establecimiento' : 'Nuevo Establecimiento'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-300 mb-1">Nombre *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2.5 md:py-2 bg-slate-700 border border-slate-600 text-white text-sm md:text-base rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Propietario *</label>
                <input
                  type="text"
                  value={formData.owner}
                  onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Latitud *</label>
                <input
                  type="number"
                  step="any"
                  value={formData.latitude}
                  onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Longitud *</label>
                <input
                  type="number"
                  step="any"
                  value={formData.longitude}
                  onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Corriente Máxima (A)</label>
                <input
                  type="number"
                  step="any"
                  value={formData.max_operating_current || ''}
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    max_operating_current: e.target.value ? parseFloat(e.target.value) : undefined 
                  })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">ID Sensor de Corriente</label>
                <input
                  type="text"
                  value={formData.current_sensor_id}
                  onChange={(e) => setFormData({ ...formData, current_sensor_id: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 sm:flex-initial bg-blue-600 text-white px-4 py-2.5 md:py-2 rounded-lg hover:bg-blue-700 text-sm md:text-base"
              >
                {editingId ? 'Actualizar' : 'Crear'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="flex-1 sm:flex-initial bg-slate-700 text-slate-200 px-4 py-2.5 md:py-2 rounded-lg hover:bg-slate-600 text-sm md:text-base"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {establishments.map((establishment) => (
          <div key={establishment.id} className="bg-slate-800 border border-slate-700 rounded-lg shadow-lg p-4 md:p-6 hover:shadow-xl transition-shadow">
            <div className="flex justify-between items-start mb-3 md:mb-4 gap-2">
              <h3 className="text-base md:text-xl font-semibold text-white flex-1 min-w-0 truncate">{establishment.name}</h3>
              <div className="flex gap-1.5 md:gap-2 flex-shrink-0">
                <button
                  onClick={() => handleEdit(establishment)}
                  className="text-blue-400 hover:text-blue-300 p-1"
                >
                  <Edit className="w-4 h-4 md:w-5 md:h-5" />
                </button>
                <button
                  onClick={() => handleDelete(establishment.id)}
                  className="text-red-400 hover:text-red-300 p-1"
                >
                  <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
                </button>
              </div>
            </div>
            <div className="space-y-1.5 md:space-y-2 text-xs md:text-sm text-slate-400">
              <div className="flex items-center gap-1.5 md:gap-2">
                <User className="w-3.5 h-3.5 md:w-4 md:h-4 flex-shrink-0" />
                <span className="truncate">{establishment.owner}</span>
              </div>
              {establishment.city && (
                <div className="flex items-center gap-1.5 md:gap-2">
                  <Building2 className="w-3.5 h-3.5 md:w-4 md:h-4 flex-shrink-0" />
                  <span className="truncate">{establishment.city}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 md:gap-2">
                <MapPin className="w-3.5 h-3.5 md:w-4 md:h-4 flex-shrink-0" />
                <span className="text-xs">{establishment.latitude.toFixed(4)}, {establishment.longitude.toFixed(4)}</span>
              </div>
              {establishment.max_operating_current && (
                <div className="text-xs">
                  Corriente máx: {establishment.max_operating_current}A
                </div>
              )}
              {establishment.current_sensor_id && (
                <div className="text-xs">
                  Sensor: {establishment.current_sensor_id}
                </div>
              )}

              {/* HMI Token Section */}
              <div className="mt-4 pt-4 border-t border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                    <Key className="w-3 h-3" /> Dashboard HMI (Raspberry)
                  </span>
                  {!establishment.hmi_token && (
                    <button
                      onClick={() => handleGenerateToken(establishment.id)}
                      className="text-[10px] bg-blue-600/20 text-blue-400 border border-blue-500/30 px-2 py-1 rounded hover:bg-blue-600/30 transition-colors"
                    >
                      Generar Token
                    </button>
                  )}
                </div>
                
                {establishment.hmi_token && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-900/50 p-2 rounded border border-slate-700 text-[10px] font-mono truncate text-slate-300">
                      {establishment.hmi_token}
                    </div>
                    <button
                      onClick={() => copyHMILink(establishment.hmi_token!, establishment.id)}
                      className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                      title="Copiar link del HMI"
                    >
                      {copiedId === establishment.id ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <a
                      href={`/hmi/${establishment.hmi_token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                      title="Abrir Dashboard HMI"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                )}
                
                {establishment.hmi_token && (
                  <button
                    onClick={() => handleGenerateToken(establishment.id)}
                    className="text-[9px] text-slate-500 hover:text-slate-300 underline"
                  >
                    Regenerar Token
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {establishments.length === 0 && !showForm && (
        <div className="text-center py-8 md:py-12 text-slate-400 text-sm md:text-base px-4">
          No hay establecimientos registrados. Haz clic en "Nuevo Establecimiento" para crear uno.
        </div>
      )}
    </div>
  );
}
