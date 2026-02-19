import { useState, useEffect, useCallback } from 'react';
import { Zap, Building2, RefreshCw, ChevronDown, Filter } from 'lucide-react';
import { api } from '../api/client';
import { establishmentsApi, Establishment } from '../api/establishments';

interface ActionLog {
  id: number;
  mac_address: string;
  action: string;
  position: number;
  result: string;
  message: string | null;
  timestamp: string;
  establishment_name: string;
  silo_name: string | null;
}

interface LogsResponse {
  period: string;
  total: number;
  logs: ActionLog[];
}

type Period = '24h' | '7d' | '30d';

interface AeratorLogsProps {
  establishmentId: number | null;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function getActionBadge(action: string) {
  return action === 'ON'
    ? 'bg-green-900/40 text-green-300 border border-green-700'
    : 'bg-red-900/40 text-red-300 border border-red-700';
}

function getResultBadge(result: string) {
  return result === 'success'
    ? 'text-green-400'
    : 'text-red-400';
}

export default function AeratorLogs({ establishmentId }: AeratorLogsProps) {
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [selectedEstId, setSelectedEstId] = useState<number | null>(establishmentId);
  const [period, setPeriod] = useState<Period>('24h');
  const [filterPosition, setFilterPosition] = useState<string>('');
  const [logs, setLogs] = useState<LogsResponse | null>(null);
  const [loadingEst, setLoadingEst] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [error, setError] = useState('');

  const token = localStorage.getItem('token') || '';

  const loadEstablishments = useCallback(async () => {
    try {
      setLoadingEst(true);
      const data = await establishmentsApi.getAll(token);
      setEstablishments(data);
      if (!selectedEstId && data.length > 0) {
        setSelectedEstId(data[0].id);
      }
    } catch {
      setError('Error al cargar establecimientos');
    } finally {
      setLoadingEst(false);
    }
  }, [token]);

  const loadLogs = useCallback(async (estId: number, p: Period, pos: string) => {
    try {
      setLoadingLogs(true);
      const params = new URLSearchParams({ establishment_id: String(estId), period: p });
      if (pos) params.append('position', pos);
      const res = await api.get(`/esp32/action-logs?${params.toString()}`);
      setLogs(res.data);
      setError('');
    } catch {
      setError('Error al cargar registros de aireadores');
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  useEffect(() => { loadEstablishments(); }, [loadEstablishments]);

  useEffect(() => {
    if (selectedEstId) loadLogs(selectedEstId, period, filterPosition);
  }, [selectedEstId, period, filterPosition, loadLogs]);

  // Posiciones únicas presentes en los logs para el filtro
  const positions = logs
    ? [...new Set(logs.logs.map(l => l.position))].sort((a, b) => a - b)
    : [];

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 md:py-8">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 md:mb-6 gap-3">
        <h1 className="text-xl md:text-3xl font-bold flex items-center gap-2 text-white">
          <Zap className="w-6 h-6 md:w-8 md:h-8 text-yellow-400" />
          Registros de Aireadores
        </h1>
        <button
          onClick={() => { if (selectedEstId) loadLogs(selectedEstId, period, filterPosition); }}
          className="flex items-center gap-2 px-3 md:px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition text-sm"
        >
          <RefreshCw className="w-4 h-4" />
          Actualizar
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-600 text-red-200 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Filtros */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-5 flex flex-col sm:flex-row gap-3 flex-wrap">
        {/* Establecimiento */}
        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <label className="text-xs text-slate-400 font-medium flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5" /> Establecimiento
          </label>
          {loadingEst ? (
            <div className="h-9 bg-slate-700 rounded-lg animate-pulse" />
          ) : (
            <div className="relative">
              <select
                value={selectedEstId ?? ''}
                onChange={(e) => setSelectedEstId(parseInt(e.target.value))}
                className="w-full pl-3 pr-8 py-2 bg-slate-700 border border-slate-600 text-white text-sm rounded-lg appearance-none focus:ring-2 focus:ring-yellow-500 outline-none"
              >
                {establishments.map((est) => (
                  <option key={est.id} value={est.id}>{est.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          )}
        </div>

        {/* Período */}
        <div className="flex flex-col gap-1 min-w-[160px]">
          <label className="text-xs text-slate-400 font-medium">Período</label>
          <div className="relative">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              className="w-full pl-3 pr-8 py-2 bg-slate-700 border border-slate-600 text-white text-sm rounded-lg appearance-none focus:ring-2 focus:ring-yellow-500 outline-none"
            >
              <option value="24h">Últimas 24 horas</option>
              <option value="7d">Última semana</option>
              <option value="30d">Último mes</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* Filtro por posición */}
        <div className="flex flex-col gap-1 min-w-[140px]">
          <label className="text-xs text-slate-400 font-medium flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Posición aireador
          </label>
          <div className="relative">
            <select
              value={filterPosition}
              onChange={(e) => setFilterPosition(e.target.value)}
              className="w-full pl-3 pr-8 py-2 bg-slate-700 border border-slate-600 text-white text-sm rounded-lg appearance-none focus:ring-2 focus:ring-yellow-500 outline-none"
            >
              <option value="">Todas</option>
              {positions.map((p) => (
                <option key={p} value={p}>Posición {p}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* Resumen */}
        {logs && (
          <div className="flex items-end pb-0.5">
            <span className="text-xs text-slate-400 bg-slate-700 px-3 py-2 rounded-lg border border-slate-600">
              {logs.total} registros encontrados
            </span>
          </div>
        )}
      </div>

      {/* Tabla de logs */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        {loadingLogs ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-yellow-500"></div>
          </div>
        ) : !selectedEstId ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            Seleccioná un establecimiento para ver los registros.
          </div>
        ) : logs && logs.logs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-700 bg-slate-800/80">
                  <th className="px-4 py-3 font-medium">Timestamp</th>
                  <th className="px-4 py-3 font-medium">Acción</th>
                  <th className="px-4 py-3 font-medium">Posición / Silo</th>
                  <th className="px-4 py-3 font-medium">Resultado</th>
                  <th className="px-4 py-3 font-medium">Dispositivo</th>
                  <th className="px-4 py-3 font-medium">Mensaje</th>
                </tr>
              </thead>
              <tbody>
                {logs.logs.map((log, idx) => (
                  <tr
                    key={log.id}
                    className={`border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors ${
                      idx % 2 === 0 ? '' : 'bg-slate-800/40'
                    }`}
                  >
                    <td className="px-4 py-2.5 text-slate-200 font-mono text-xs whitespace-nowrap">
                      {formatDate(log.timestamp)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2.5 py-1 rounded text-xs font-bold ${getActionBadge(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-300 text-xs">
                      <span className="font-medium">Pos. {log.position}</span>
                      {log.silo_name && (
                        <span className="text-slate-500 ml-1">— {log.silo_name}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      <span className={`font-medium ${getResultBadge(log.result)}`}>
                        {log.result === 'success' ? '✓ OK' : '✗ Error'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-400 font-mono text-xs whitespace-nowrap">
                      {log.mac_address}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">
                      {log.message || <span className="text-slate-700">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-slate-400 text-sm">
            No hay registros de aireadores para el período seleccionado.
          </div>
        )}
      </div>
    </div>
  );
}
