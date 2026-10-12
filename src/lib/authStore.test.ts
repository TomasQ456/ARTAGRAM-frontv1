import { beforeEach, describe, expect, it } from 'vitest';
import { obtenerTokenActual, useAuthStore, type SesionUsuario } from './authStore';

const SESION_DEMO: SesionUsuario = {
  accessToken: 'token-de-prueba',
  usuarioId: 'u1',
  nombreArtista: 'lienzo_azul',
  rolGlobal: 'USUARIO',
  premium: false,
};

const CLAVE_STORAGE = 'artagram.sesion';

// El store es un singleton de modulo (persiste entre tests) — se resetea a
// mano en cada uno para que no arrastren estado entre si, igual que haria un
// beforeEach de logout en la app real.
beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({ sesion: null, sesionExpirada: false });
});

describe('iniciarSesion', () => {
  it('guarda la sesion en el store y en localStorage, y apaga el aviso de expirada', () => {
    useAuthStore.setState({ sesionExpirada: true });

    useAuthStore.getState().iniciarSesion(SESION_DEMO);

    expect(useAuthStore.getState().sesion).toEqual(SESION_DEMO);
    expect(useAuthStore.getState().sesionExpirada).toBe(false);
    expect(JSON.parse(localStorage.getItem(CLAVE_STORAGE)!)).toEqual(SESION_DEMO);
  });
});

describe('cerrarSesion', () => {
  it('borra la sesion del store y de localStorage', () => {
    useAuthStore.getState().iniciarSesion(SESION_DEMO);

    useAuthStore.getState().cerrarSesion();

    expect(useAuthStore.getState().sesion).toBeNull();
    expect(localStorage.getItem(CLAVE_STORAGE)).toBeNull();
  });

  it('tambien apaga el aviso de sesion expirada (logout manual, no por vencimiento)', () => {
    useAuthStore.setState({ sesionExpirada: true });

    useAuthStore.getState().cerrarSesion();

    expect(useAuthStore.getState().sesionExpirada).toBe(false);
  });
});

describe('expirarSesion', () => {
  it('borra la sesion pero deja prendido el aviso, a diferencia de cerrarSesion', () => {
    useAuthStore.getState().iniciarSesion(SESION_DEMO);

    useAuthStore.getState().expirarSesion();

    expect(useAuthStore.getState().sesion).toBeNull();
    expect(useAuthStore.getState().sesionExpirada).toBe(true);
    expect(localStorage.getItem(CLAVE_STORAGE)).toBeNull();
  });
});

describe('limpiarAvisoSesionExpirada', () => {
  it('apaga el aviso sin tocar la sesion actual', () => {
    useAuthStore.getState().iniciarSesion(SESION_DEMO);
    useAuthStore.setState({ sesionExpirada: true });

    useAuthStore.getState().limpiarAvisoSesionExpirada();

    expect(useAuthStore.getState().sesionExpirada).toBe(false);
    expect(useAuthStore.getState().sesion).toEqual(SESION_DEMO);
  });
});

describe('obtenerTokenActual', () => {
  it('devuelve null si no hay sesion', () => {
    expect(obtenerTokenActual()).toBeNull();
  });

  it('devuelve el accessToken de la sesion activa', () => {
    useAuthStore.getState().iniciarSesion(SESION_DEMO);

    expect(obtenerTokenActual()).toBe('token-de-prueba');
  });
});
