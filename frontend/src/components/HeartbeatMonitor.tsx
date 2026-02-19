import { useState, useEffect, useCallback } from 'react';
import { Activity, Cpu, Building2, Clock, RefreshCw, Wifi, WifiOff, AlertTriangle, ChevronDown } from 'lucide-react';
import { api } from '../api/client';

interface BoardSummary {
  mac_address: string;
  status: string;
  last_heartbeat: string | null;
  firmware_version: string | null;
  establishment_name: string | null;
  heartbeats_24h: number;
}

interface Heartbeat {
  id: number;
  mac_address: string;
  firmware_version: string | null;
  timestamp: string;
}

interface HeartbeatDetail {
  board: BoardSummary;
  period: string;
  total: number;
  heartbeats: Heartbeat[];
}

type Period = '24h' | '7d';

function getStatusIcon(status: string) {
  switch (status) {
    case 'online':
      return <Wifi className="w-4 h-4 text-green-400" />;
    case 'warning':
      return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
    default:
      return <WifiOff className="w-4 h-4 text-red-400" />;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'online':
      return 'bg-green-900/40 text-green-300 border border-green-700';
    case 'warning':
      return 'bg-yellow-900/40 text-yellow-300 border border-yellow-700';
    default:
      return 'bg-red-900/40 text-red-300 border border-red-700';
  }
}

function getStatusText(status: string) {
  switch (status) {
    case 'online':  return 'En línea';
    case 'warning': return 'Advertencia';
    default:        return 'Desconectado';
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function timeSince(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)  return `hace ${diff}s`;
  if (diff < 3600) return `hace ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
  return `hace ${Math.floor(diff / 86400)}d`;
}

export default function HeartbeatMonitor() {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [selectedMac, setSelectedMac] = useState<string>('');
  const [detail, setDetail] = useState<HeartbeatDetail | null>(null);
  const [period, setPeriod] = useState<Period>('24h');
  const [loadingBoards, setLoadingBoards] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const loadBoards = useCallback(async () => {
    try {
      setLoadingBoards(true);
      const res = await api.get('/esp32/heartbeats');
      setBoards(res.data);
      setError('');
    } catch (err: any) {
      setError('Error al cargar dispositivos');
    } finally {
      setLoadingBoards(false);
    }
  }, []);

  const loadDetail = useCallback(async (mac: string, p: Period) => {
    if (!mac) return;
    try {
      setLoadingDetail(true);
      const res = await api.get(`/esp32/heartbeats/${encodeURIComponent(mac)}?period=${p}`);
      setDetail(res.data);
      setLastRefresh(new Date());
      setError('');
    } catch (err: any) {
      setError('Error al cargar heartbeats del dispositivo');
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    loadBoards();
  }, [loadBoards]);

  useEffect(() => {
    if (selectedMac) {
      loadDetail(selectedMac, period);
    }
  }, [selectedMac, period, loadDetail]);

  const handleRefresh = () => {
    loadBoards();
    if (selectedMac) loadDetail(selectedMac, period);
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 md:py-8">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 md:mb-6 gap-3">
        <h1 className="text-xl md:text-3xl font-bold flex items-center gap-2 text-white">
          <Activity className="w-6 h-6 md:w-8 md:h-8 text-blue-400" />
          Monitor de Heartbeats ESP32
        </h1>
        <button
          onClick={handleRefresh}
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

      {/* Tarjetas resumen de dispositivos */}
      {loadingBoards ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 mb-6">
          {boards.map((board) => (
            <button
              key={board.mac_address}
              onClick={() => setSelectedMac(board.mac_address)}
              className={`text-left bg-slate-800 border rounded-lg p-4 transition-all hover:border-blue-500 ${
                selectedMac === board.mac_address
                  ? 'border-blue-500 ring-1 ring-blue-500'
                  : 'border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <span className="font-mono text-xs md:text-sm text-white truncate">{board.mac_address}</span>
                </div>
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(board.status)}`}>
                  {getStatusIcon(board.status)}
                  {getStatusText(board.status)}
                </span>
              </div>

              <div className="space-y-1 text-xs text-slate-400">
                {board.establishment_name && (
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{board.establishment_name}</span>
                  </div>
                )}
                {board.last_heartbeat && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>Último: {timeSince(board.last_heartbeat)}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{board.heartbeats_24h} heartbeats en las últimas 24h</span>
                </div>
                {board.firmware_version && (
                  <div className="text-slate-500">FW: {board.firmware_version}</div>
                )}
              </div>
            </button>
          ))}

          {boards.length === 0 && (
            <div className="col-span-full text-center py-10 text-slate-400 text-sm">
              No hay dispositivos ESP32 registrados.
            </div>
          )}
        </div>
      )}

      {/* Detalle de heartbeats del dispositivo seleccionado */}
      {selectedMac && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg">
          {/* Cabecera del panel de detalle */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 border-b border-slate-700">
            <div>
              <h2 className="text-base md:text-lg font-semibold text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-blue-400" />
                <span className="font-mono">{selectedMac}</span>
              </h2>
              {detail && (
                <p className="text-xs text-slate-400 mt-0.5">
                  {detail.total} registros · actualizado {formatDate(lastRefresh.toISOString())}
                </p>
              )}
            </div>

            {/* Selector de período */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Período:</span>
              <div className="relative">
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as Period)}
                  className="pl-3 pr-8 py-1.5 bg-slate-700 border border-slate-600 text-white text-sm rounded-lg appearance-none focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="24h">Últimas 24 horas</option>
                  <option value="7d">Última semana</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Tabla de heartbeats */}
          {loadingDetail ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : detail && detail.heartbeats.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-700">
                    <th className="px-4 py-3 font-medium">#</th>
                    <th className="px-4 py-3 font-medium">Timestamp</th>
                    <th className="px-4 py-3 font-medium">Hace</th>
                    <th className="px-4 py-3 font-medium">Firmware</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.heartbeats.map((hb, idx) => (
                    <tr
                      key={hb.id}
                      className={`border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors ${
                        idx === 0 ? 'bg-blue-900/10' : ''
                      }`}
                    >
                      <td className="px-4 py-2.5 text-slate-500 text-xs">{hb.id}</td>
                      <td className="px-4 py-2.5 text-slate-200 font-mono text-xs whitespace-nowrap">
                        {formatDate(hb.timestamp)}
                      </td>
                      <td className="px-4 py-2.5 text-slate-400 text-xs whitespace-nowrap">
                        {timeSince(hb.timestamp)}
                      </td>
                      <td className="px-4 py-2.5 text-slate-400 text-xs">
                        {hb.firmware_version || <span className="text-slate-600">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-10 text-slate-400 text-sm">
              No hay heartbeats registrados para el período seleccionado.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
