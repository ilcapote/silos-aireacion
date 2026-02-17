import { api } from './client';

export interface Establishment {
  id: number;
  name: string;
  owner: string;
  latitude: number;
  longitude: number;
  city?: string;
  max_operating_current?: number;
  current_sensor_id?: string;
  hmi_token?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateEstablishmentData {
  name: string;
  owner: string;
  latitude: number;
  longitude: number;
  max_operating_current?: number;
  current_sensor_id?: string;
}

export interface UpdateEstablishmentData extends CreateEstablishmentData {
  id: number;
}

export const establishmentsApi = {
  // Listar todos los establecimientos
  getAll: async (token: string): Promise<Establishment[]> => {
    const response = await api.get('/establishments', {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Obtener un establecimiento por ID
  getById: async (id: number, token: string): Promise<Establishment> => {
    const response = await api.get(`/establishments/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  // Crear nuevo establecimiento
  create: async (data: CreateEstablishmentData, token: string): Promise<Establishment> => {
    const response = await api.post('/establishments', data, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data.establishment;
  },

  // Actualizar establecimiento
  update: async (id: number, data: CreateEstablishmentData, token: string): Promise<Establishment> => {
    const response = await api.put(`/establishments/${id}`, data, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data.establishment;
  },

  // Eliminar establecimiento
  delete: async (id: number, token: string): Promise<void> => {
    await api.delete(`/establishments/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  },

  // Generar token HMI
  generateHMIToken: async (id: number, token: string): Promise<string> => {
    const response = await api.post(`/establishments/${id}/hmi-token`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data.token;
  }
};
