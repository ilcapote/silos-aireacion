import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { boardsApi, Board, CreateBoardData } from '../api/boards';
import { establishmentsApi, Establishment } from '../api/establishments';
import { Cpu, Plus, Edit, Trash2, Building2, Activity, Clock } from 'lucide-react';

interface BoardsProps {
  establishmentId: number | null;
}

export default function Boards({ establishmentId }: BoardsProps) {
  const { isAuthenticated } = useAuth();
  const [boards, setBoards] = useState<Board[]>([]);
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<CreateBoardData>({
    mac_address: '',
    establishment_id: establishmentId || 0
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
      const [boardsData, establishmentsData] = await Promise.all([
        boardsApi.getAll(token),
        establishmentsApi.getAll(token)
      ]);
      
      // Filtrar por establecimiento seleccionado (si hay uno)
      const filteredBoards = establishmentId 
        ? boardsData.filter(board => board.establishment_id === establishmentId)
        : boardsData;
        
      setBoards(filteredBoards);
      setEstablishments(establishmentsData);
      setError('');
    } catch (err: any) {
      console.error('Error al cargar datos de Boards:', err);
      console.error('Response:', err.response?.data);
      setError(err.response?.data?.error || 'Error al cargar datos');
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
        await boardsApi.update(editingId, formData, token);
      } else {
        await boardsApi.create(formData, token);
      }

      await loadData();
      resetForm();
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al guardar dispositivo');
    }
  };

  const handleEdit = (board: Board) => {
    setFormData({
      mac_address: board.mac_address,
      establishment_id: board.establishment_id
    });
    setEditingId(board.id);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    const token = getToken();
    if (!token) return;
    if (!confirm('¿Estás seguro de eliminar este dispositivo ESP32?')) return;

    try {
      await boardsApi.delete(id, token);
      await loadData();
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al eliminar dispositivo');
    }
  };

  const resetForm = () => {
    setFormData({
      mac_address: '',
      establishment_id: establishmentId || (establishments.length > 0 ? establishments[0].id : 0)
    });
    setEditingId(null);
    setShowForm(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'bg-green-100 text-green-800';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800';
      case 'offline':
      default:
        return 'bg-red-100 text-red-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'online':
        return 'En línea';
      case 'warning':
        return 'Advertencia';
      case 'offline':
      default:
        return 'Desconectado';
    }
  };

  const formatMacAddress = (mac: string) => {
    // Asegurar formato XX:XX:XX:XX:XX:XX
    return mac.toUpperCase();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('es-AR');
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
          <Cpu className="w-6 h-6 md:w-8 md:h-8" />
          Gestión de Dispositivos ESP32
        </h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-3 md:px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm md:text-base w-full sm:w-auto justify-center"
        >
          <Plus className="w-4 h-4 md:w-5 md:h-5" />
          Nuevo Dispositivo
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-600 text-red-200 px-3 md:px-4 py-2.5 md:py-3 rounded mb-4 text-xs md:text-sm">
          {error}
        </div>
      )}

      {showForm && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-md p-4 md:p-6 mb-4 md:mb-6">
          <h2 className="text-lg md:text-xl font-semibold text-white mb-3 md:mb-4">
            {editingId ? 'Editar Dispositivo ESP32' : 'Nuevo Dispositivo ESP32'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-300 mb-1">
                  Dirección MAC * <span className="text-xs text-slate-400">(XX:XX:XX:XX:XX:XX)</span>
                </label>
                <input
                  type="text"
                  value={formData.mac_address}
                  onChange={(e) => setFormData({ ...formData, mac_address: e.target.value })}
                  placeholder="AA:BB:CC:DD:EE:FF"
                  pattern="^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$"
                  className="w-full px-3 py-2.5 md:py-2 bg-slate-700 border border-slate-600 text-white text-sm md:text-base rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-300 mb-1">Establecimiento *</label>
                <select
                  value={formData.establishment_id}
                  onChange={(e) => setFormData({ ...formData, establishment_id: parseInt(e.target.value) })}
                  className="w-full px-3 py-2.5 md:py-2 bg-slate-700 border border-slate-600 text-white text-sm md:text-base rounded-lg focus:ring-2 focus:ring-blue-500"
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
            </div>
            <div className="text-xs md:text-sm text-slate-400 bg-blue-900/20 p-2.5 md:p-3 rounded">
              <strong>Nota:</strong> La versión del firmware será reportada automáticamente por el dispositivo ESP32 cuando se conecte.
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
                className="flex-1 sm:flex-initial bg-slate-700 text-slate-300 px-4 py-2.5 md:py-2 rounded-lg hover:bg-slate-600 text-sm md:text-base"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {boards.map((board) => (
          <div key={board.id} className="bg-slate-800 border border-slate-700 rounded-lg shadow-md p-4 md:p-6 hover:shadow-lg transition-shadow">
            <div className="flex justify-between items-start mb-3 md:mb-4 gap-2">
              <div className="flex items-center gap-1.5 md:gap-2 flex-1 min-w-0">
                <Cpu className="w-5 h-5 md:w-6 md:h-6 text-blue-400 flex-shrink-0" />
                <h3 className="text-sm md:text-lg font-semibold font-mono text-white truncate">{formatMacAddress(board.mac_address)}</h3>
              </div>
              <div className="flex gap-1.5 md:gap-2 flex-shrink-0">
                <button
                  onClick={() => handleEdit(board)}
                  className="text-blue-400 hover:text-blue-300 p-1"
                >
                  <Edit className="w-4 h-4 md:w-5 md:h-5" />
                </button>
                <button
                  onClick={() => handleDelete(board.id)}
                  className="text-red-400 hover:text-red-300 p-1"
                >
                  <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
                </button>
              </div>
            </div>

            <div className="space-y-1.5 md:space-y-2 text-xs md:text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Estado:</span>
                <span className={`px-2 py-0.5 md:py-1 rounded-full text-xs font-medium flex items-center gap-1 ${getStatusColor(board.status)}`}>
                  <Activity className="w-3 h-3" />
                  {getStatusText(board.status)}
                </span>
              </div>

              <div className="flex items-center gap-1.5 md:gap-2 text-slate-400">
                <Building2 className="w-3.5 h-3.5 md:w-4 md:h-4 flex-shrink-0" />
                <span className="truncate">{board.establishment_name || `ID: ${board.establishment_id}`}</span>
              </div>

              {board.firmware_version && (
                <div className="text-xs text-slate-400">
                  Firmware: {board.firmware_version}
                </div>
              )}

              <div className="flex items-center gap-1.5 md:gap-2 text-xs text-slate-400 pt-1.5 md:pt-2 border-t border-slate-700">
                <Clock className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">Reg: {formatDate(board.registration_date)}</span>
              </div>

              {board.last_heartbeat && (
                <div className="text-xs text-slate-400">
                  Último heartbeat: {formatDate(board.last_heartbeat)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {boards.length === 0 && !showForm && (
        <div className="text-center py-8 md:py-12 text-slate-400 text-sm md:text-base px-4">
          No hay dispositivos ESP32 registrados. Haz clic en "Nuevo Dispositivo" para crear uno.
        </div>
      )}
    </div>
  );
}
