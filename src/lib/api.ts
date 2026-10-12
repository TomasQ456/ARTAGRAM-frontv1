import axios from 'axios';
import { obtenerTokenActual, useAuthStore } from './authStore';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';
export const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8080/ws';

export const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = obtenerTokenActual();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (respuesta) => respuesta,
  (error) => {
    if (error.response?.status === 401 && useAuthStore.getState().sesion) {
      useAuthStore.getState().expirarSesion();
    }
    return Promise.reject(error);
  },
);

export interface ErrorApi {
  code: string;
  message: string;
  traceId?: string;
  violations?: { field: string; message: string }[];
}

export function extraerMensajeError(error: unknown, porDefecto = 'Algo salió mal, intenta de nuevo'): string {
  if (axios.isAxiosError(error)) {
    const datos = error.response?.data as ErrorApi | undefined;
    if (datos?.violations?.length) {
      return datos.violations.map((v) => v.message).join('. ');
    }
    if (datos?.message) {
      return datos.message;
    }
  }
  return porDefecto;
}
