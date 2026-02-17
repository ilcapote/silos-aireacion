import { api } from './client';

export interface Board {
  id: number;
  mac_address: string;
  establishment_id: number;
  establishment_name?: string;
  registration_date: string;
  firmware_version?: string;
  last_heartbeat?: string;
  status: 'online' | 'offline' | 'warning';
  created_at: string;
  updated_at: string;
}

export interface CreateBoardData {
  mac_address: string;
  establishment_id: number;
  firmware_version?: string;
}

export interface UpdateBoardData extends CreateBoardData {
  status?: 'online' | 'offline' | 'warning';
}

export const boardsApi = {
  // Listar todos los dispositivos
  getAll: async (token: string): Promise<Board[]> => {
    const response = await api.get('/boards', {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Obtener un dispositivo por ID
  getById: async (id: number, token: string): Promise<Board> => {
    const response = await api.get(`/boards/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Obtener dispositivos de un establecimiento
  getByEstablishment: async (establishmentId: number, token: string): Promise<Board[]> => {
    const response = await api.get(`/boards/establishment/${establishmentId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Crear nuevo dispositivo
  create: async (data: CreateBoardData, token: string): Promise<Board> => {
    const response = await api.post('/boards', data, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data.board;
  },

  // Actualizar dispositivo
  update: async (id: number, data: UpdateBoardData, token: string): Promise<Board> => {
    const response = await api.put(`/boards/${id}`, data, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data.board;
  },

  // Eliminar dispositivo
  delete: async (id: number, token: string): Promise<void> => {
    await api.delete(`/boards/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  // Actualizar heartbeat
  updateHeartbeat: async (id: number, firmwareVersion: string | undefined, token: string): Promise<void> => {
    await api.post(`/boards/${id}/heartbeat`, 
      { firmware_version: firmwareVersion },
      { headers: { Authorization: `Bearer ${token}` } }
    );
  }
};
