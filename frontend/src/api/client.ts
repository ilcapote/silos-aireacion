import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para agregar el token a todas las peticiones
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor para manejar errores de autenticación
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

export interface User {
  id: number;
  username: string;
  role: string;
  requirePasswordChange: boolean;
  created_at: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface SiloParameters {
  id: number;
  silo_name: string;
  temperature_max: number;
  temperature_min: number;
  humidity_max: number;
  humidity_min: number;
  aeration_enabled: number;
  created_at: string;
  updated_at: string;
}

// Auth API
export const authAPI = {
  login: (username: string, password: string) =>
    api.post<LoginResponse>('/auth/login', { username, password }),
  
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),
  
  verify: () => api.get('/auth/verify'),
};

// Users API
export const usersAPI = {
  getAll: () => api.get<User[]>('/users'),
  
  create: (username: string) =>
    api.post('/users', { username }),
  
  delete: (id: number) => api.delete(`/users/${id}`),
  
  resetPassword: (id: number) =>
    api.post(`/users/${id}/reset-password`),
};

// Silos API
export const silosAPI = {
  getAll: () => api.get<SiloParameters[]>('/silos'),
  
  get: (siloName: string) =>
    api.get<SiloParameters>(`/silos/${siloName}`),
  
  createOrUpdate: (data: Partial<SiloParameters>) =>
    api.post<SiloParameters>('/silos', data),
  
  delete: (siloName: string) =>
    api.delete(`/silos/${siloName}`),
  
  getLogs: (siloName: string, limit = 100) =>
    api.get(`/silos/${siloName}/logs`, { params: { limit } }),
};
