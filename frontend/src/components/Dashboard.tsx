import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserManagement } from './UserManagement';
import Establishments from './Establishments';
import Boards from './Boards';
import Silos from './Silos';
import SensorManagement from './SensorManagement';
import SensorBarManagement from './SensorBarManagement';
import { MonitoringDashboard } from './MonitoringDashboard';
import { ChangePasswordModal } from './ChangePasswordModal';
import HeartbeatMonitor from './HeartbeatMonitor';
import RebootMonitor from './RebootMonitor';
import AeratorLogs from './AeratorLogs';
import { establishmentsApi, Establishment } from '../api/establishments';
import { LogOut, Key, Users, Building2, Cpu, Container, Thermometer, Layers, Gauge, ChevronDown, Activity, RotateCcw, Zap } from 'lucide-react';

type AdminTab = 'monitoring' | 'users' | 'establishments' | 'boards' | 'silos' | 'sensors' | 'sensor-bars' | 'heartbeats' | 'reboots' | 'aerator-logs';

export const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>('monitoring');
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [selectedEstablishmentId, setSelectedEstablishmentId] = useState<number | null>(() => {
    const saved = localStorage.getItem('selectedEstablishmentId');
    if (saved === 'all') return null;
    return saved ? parseInt(saved) : null;
  });

  useEffect(() => {
    if (user?.role === 'super_admin') {
      loadEstablishments();
    }
  }, [user]);

  const loadEstablishments = async () => {
    try {
      const token = localStorage.getItem('token') || '';
      const data = await establishmentsApi.getAll(token);
      setEstablishments(data);
      
      // No seleccionamos automáticamente el primero si ya hay algo guardado
      // o si queremos que por defecto sea "Todos" (null)
    } catch (error) {
      console.error('Error al cargar establecimientos:', error);
    }
  };

  const handleEstablishmentChange = (id: number | 'all') => {
    if (id === 'all') {
      setSelectedEstablishmentId(null);
      localStorage.setItem('selectedEstablishmentId', 'all');
    } else {
      setSelectedEstablishmentId(id);
      localStorage.setItem('selectedEstablishmentId', id.toString());
    }
  };

  const handlePasswordChanged = () => {
    setShowPasswordModal(false);
    alert('Contraseña cambiada exitosamente');
  };

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="bg-slate-800 shadow-lg shadow-black/20">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 md:py-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="text-lg md:text-2xl font-bold text-white truncate">Sistema de Aireación de Silos</h1>
              <p className="text-xs md:text-sm text-slate-300">
                Bienvenido, <span className="font-semibold">{user?.username}</span>
                {user?.role === 'super_admin' && (
                  <span className="ml-2 px-2 py-0.5 md:py-1 bg-purple-600 text-purple-100 rounded text-xs">
                    Super Admin
                  </span>
                )}
              </p>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <button
                onClick={() => setShowPasswordModal(true)}
                className="flex items-center justify-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition duration-200 text-xs md:text-sm flex-1 sm:flex-initial"
              >
                <Key className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span className="hidden sm:inline">Cambiar Contraseña</span>
                <span className="sm:hidden">Contraseña</span>
              </button>
              <button
                onClick={logout}
                className="flex items-center justify-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg transition duration-200 text-xs md:text-sm"
              >
                <LogOut className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span className="hidden sm:inline">Salir</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 md:py-8">
        {user?.requirePasswordChange && (
          <div className="mb-4 md:mb-6 bg-orange-900/30 border border-orange-600 text-orange-200 px-4 md:px-6 py-3 md:py-4 rounded-lg">
            <p className="font-semibold text-sm md:text-base">⚠️ Debe cambiar su contraseña</p>
            <p className="text-xs md:text-sm mt-1">
              Por seguridad, debe cambiar su contraseña temporal antes de continuar.
            </p>
            <button
              onClick={() => setShowPasswordModal(true)}
              className="mt-3 bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-lg text-xs md:text-sm w-full sm:w-auto"
            >
              Cambiar Ahora
            </button>
          </div>
        )}

        {user?.role === 'super_admin' && (
          <>
            <div className="mb-4 md:mb-6 flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="bg-blue-900/30 border border-blue-600 rounded-lg p-3 md:p-4 flex items-center gap-2 md:gap-3">
                  <Users className="w-5 h-5 md:w-6 md:h-6 text-blue-400 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-sm md:text-base text-blue-200">Panel de Administración</h3>
                    <p className="text-xs md:text-sm text-blue-300">Gestione usuarios, establecimientos, dispositivos ESP32, silos y configuraciones del sistema</p>
                  </div>
                </div>
              </div>
              
              {/* Selector de Establecimiento */}
              <div className="w-full sm:w-64">
                <div className="relative">
                  <label className="block text-xs font-medium text-slate-400 mb-1 ml-1">Seleccionar Establecimiento</label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 pointer-events-none" />
                    <select
                      value={selectedEstablishmentId === null ? 'all' : selectedEstablishmentId}
                      onChange={(e) => {
                        const val = e.target.value;
                        handleEstablishmentChange(val === 'all' ? 'all' : parseInt(val));
                      }}
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-800 border border-slate-700 text-white text-sm rounded-lg appearance-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                    >
                      <option value="all">Todos los Establecimientos</option>
                      {establishments.length > 0 && establishments.map((est) => (
                        <option key={est.id} value={est.id}>
                          {est.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>

            {/* Pestañas de navegación */}
            <div className="mb-4 md:mb-6 border-b border-slate-700 overflow-x-auto">
              <nav className="-mb-px flex space-x-4 md:space-x-8 min-w-max">
                <button
                  onClick={() => setActiveTab('monitoring')}
                  className={`
                    py-3 md:py-4 px-1 border-b-2 font-medium text-xs md:text-sm flex items-center gap-1.5 md:gap-2 whitespace-nowrap
                    ${activeTab === 'monitoring'
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
                    }
                  `}
                >
                  <Gauge className="w-4 h-4 md:w-5 md:h-5" />
                  Monitoreo
                </button>
                <button
                  onClick={() => setActiveTab('users')}
                  className={`
                    py-3 md:py-4 px-1 border-b-2 font-medium text-xs md:text-sm flex items-center gap-1.5 md:gap-2 whitespace-nowrap
                    ${activeTab === 'users'
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
                    }
                  `}
                >
                  <Users className="w-4 h-4 md:w-5 md:h-5" />
                  Usuarios
                </button>
                <button
                  onClick={() => setActiveTab('establishments')}
                  className={`
                    py-3 md:py-4 px-1 border-b-2 font-medium text-xs md:text-sm flex items-center gap-1.5 md:gap-2 whitespace-nowrap
                    ${activeTab === 'establishments'
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
                    }
                  `}
                >
                  <Building2 className="w-4 h-4 md:w-5 md:h-5" />
                  Establecimientos
                </button>
                <button
                  onClick={() => setActiveTab('boards')}
                  className={`
                    py-3 md:py-4 px-1 border-b-2 font-medium text-xs md:text-sm flex items-center gap-1.5 md:gap-2 whitespace-nowrap
                    ${activeTab === 'boards'
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
                    }
                  `}
                >
                  <Cpu className="w-4 h-4 md:w-5 md:h-5" />
                  <span className="hidden sm:inline">Dispositivos ESP32</span>
                  <span className="sm:hidden">ESP32</span>
                </button>
                <button
                  onClick={() => setActiveTab('silos')}
                  className={`
                    py-3 md:py-4 px-1 border-b-2 font-medium text-xs md:text-sm flex items-center gap-1.5 md:gap-2 whitespace-nowrap
                    ${activeTab === 'silos'
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
                    }
                  `}
                >
                  <Container className="w-4 h-4 md:w-5 md:h-5" />
                  Silos
                </button>
                <button
                  onClick={() => setActiveTab('sensors')}
                  className={`
                    py-3 md:py-4 px-1 border-b-2 font-medium text-xs md:text-sm flex items-center gap-1.5 md:gap-2 whitespace-nowrap
                    ${activeTab === 'sensors'
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
                    }
                  `}
                >
                  <Thermometer className="w-4 h-4 md:w-5 md:h-5" />
                  Sensores
                </button>
                <button
                  onClick={() => setActiveTab('sensor-bars')}
                  className={`
                    py-3 md:py-4 px-1 border-b-2 font-medium text-xs md:text-sm flex items-center gap-1.5 md:gap-2 whitespace-nowrap
                    ${activeTab === 'sensor-bars'
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
                    }
                  `}
                >
                  <Layers className="w-4 h-4 md:w-5 md:h-5" />
                  Barras
                </button>
                <button
                  onClick={() => setActiveTab('heartbeats')}
                  className={`
                    py-3 md:py-4 px-1 border-b-2 font-medium text-xs md:text-sm flex items-center gap-1.5 md:gap-2 whitespace-nowrap
                    ${activeTab === 'heartbeats'
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
                    }
                  `}
                >
                  <Activity className="w-4 h-4 md:w-5 md:h-5" />
                  Heartbeats
                </button>
                <button
                  onClick={() => setActiveTab('reboots')}
                  className={`
                    py-3 md:py-4 px-1 border-b-2 font-medium text-xs md:text-sm flex items-center gap-1.5 md:gap-2 whitespace-nowrap
                    ${activeTab === 'reboots'
                      ? 'border-orange-500 text-orange-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
                    }
                  `}
                >
                  <RotateCcw className="w-4 h-4 md:w-5 md:h-5" />
                  Reinicios
                </button>
                <button
                  onClick={() => setActiveTab('aerator-logs')}
                  className={`
                    py-3 md:py-4 px-1 border-b-2 font-medium text-xs md:text-sm flex items-center gap-1.5 md:gap-2 whitespace-nowrap
                    ${activeTab === 'aerator-logs'
                      ? 'border-yellow-500 text-yellow-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
                    }
                  `}
                >
                  <Zap className="w-4 h-4 md:w-5 md:h-5" />
                  <span className="hidden sm:inline">Registros Aireador</span>
                  <span className="sm:hidden">Aireador</span>
                </button>
              </nav>
            </div>

            {/* Contenido de las pestañas */}
            {activeTab === 'monitoring' && (
              <MonitoringDashboard establishmentId={selectedEstablishmentId} />
            )}
            {activeTab === 'users' && <UserManagement />}
            {activeTab === 'establishments' && <Establishments />}
            {activeTab === 'boards' && (
              <Boards establishmentId={selectedEstablishmentId} />
            )}
            {activeTab === 'silos' && (
              <Silos establishmentId={selectedEstablishmentId} />
            )}
            {activeTab === 'sensors' && <SensorManagement />}
            {activeTab === 'sensor-bars' && (
              <SensorBarManagement establishmentId={selectedEstablishmentId} />
            )}
            {activeTab === 'heartbeats' && <HeartbeatMonitor />}
            {activeTab === 'reboots' && <RebootMonitor />}
            {activeTab === 'aerator-logs' && (
              <AeratorLogs establishmentId={selectedEstablishmentId} />
            )}
          </>
        )}

        {user?.role !== 'super_admin' && (
          <AeratorLogs establishmentId={selectedEstablishmentId} />
        )}
      </main>

      {/* Modal cambiar contraseña */}
      {showPasswordModal && (
        <ChangePasswordModal
          onClose={() => setShowPasswordModal(false)}
          onSuccess={handlePasswordChanged}
        />
      )}
    </div>
  );
};
