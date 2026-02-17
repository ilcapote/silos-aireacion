import { api } from './client';

export interface Silo {
  id: number;
  name: string;
  establishment_id: number;
  establishment_name?: string;
  aerator_position: number;
  min_temperature: number;
  max_temperature: number;
  min_humidity: number;
  max_humidity: number;
  peak_hours_shutdown: number;
  air_start_hour: number;
  air_end_hour: number;
  use_sun_schedule: number;
  manual_mode: 'auto' | 'on' | 'off';
  current_state: boolean;
  forced_off_reason?: string;
  modified: number;
  created_at: string;
  updated_at: string;
}

export interface CreateSiloData {
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
}

export interface UpdateSiloData extends CreateSiloData {
  manual_mode?: 'auto' | 'on' | 'off';
}

export const silosApi = {
  // Listar todos los silos
  getAll: async (token: string): Promise<Silo[]> => {
    const response = await api.get('/silos-management', {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Obtener un silo por ID
  getById: async (id: number, token: string): Promise<Silo> => {
    const response = await api.get(`/silos-management/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Obtener silos de un establecimiento
  getByEstablishment: async (establishmentId: number, token: string): Promise<Silo[]> => {
    const response = await api.get(`/silos-management/establishment/${establishmentId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Obtener posiciones disponibles para un establecimiento
  getAvailablePositions: async (establishmentId: number, token: string, excludeSiloId?: number): Promise<number[]> => {
    const params = excludeSiloId ? { excludeSiloId: excludeSiloId.toString() } : {};
    const response = await api.get(
      `/silos-management/establishment/${establishmentId}/available-positions`,
      { 
        headers: { Authorization: `Bearer ${token}` },
        params
      }
    );
    return response.data.available_positions;
  },

  // Crear nuevo silo
  create: async (data: CreateSiloData, token: string): Promise<Silo> => {
    const response = await api.post('/silos-management', data, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data.silo;
  },

  // Actualizar silo
  update: async (id: number, data: UpdateSiloData, token: string): Promise<Silo> => {
    const response = await api.put(`/silos-management/${id}`, data, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data.silo;
  },

  // Eliminar silo
  delete: async (id: number, token: string): Promise<void> => {
    await api.delete(`/silos-management/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  }
};
