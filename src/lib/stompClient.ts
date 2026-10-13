import { Client, type IMessage, type StompSubscription } from '@stomp/stompjs';
import { WS_URL } from './api';

/**
 * Una sola conexion STOMP compartida por toda la sesion (lienzo, banner,
 * fiesta y chat se suscriben sobre ella). El token va como query param en la
 * URL del WebSocket porque el navegador no puede mandar headers propios en el
 * handshake nativo (ver JwtHandshakeInterceptor en el backend).
 */
class StompService {
  private client: Client | null = null;
  private tokenActual: string | null = null;
  // Suscripciones activas: se (re)aplican en cada conexion, incluidas las
  // reconexiones automaticas, y salen del conjunto al desuscribirse.
  private suscripcionesActivas = new Set<() => void>();
  private callbacksAlConectar = new Set<() => void>();

  conectar(token: string): void {
    if (this.client?.active && this.tokenActual === token) {
      return;
    }
    this.desconectar();
    this.tokenActual = token;

    const url = `${WS_URL}${WS_URL.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
    this.client = new Client({
      brokerURL: url,
      reconnectDelay: 2000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      onConnect: () => {
        this.suscripcionesActivas.forEach((fn) => fn());
        this.callbacksAlConectar.forEach((fn) => fn());
      },
    });
    this.client.activate();
  }

  desconectar(): void {
    this.client?.deactivate();
    this.client = null;
  }

  estaConectado(): boolean {
    return !!this.client?.connected;
  }

  /**
   * Se suscribe ahora si hay conexion y se re-suscribe sola tras cada
   * reconexion (util cuando se cae la red), hasta llamar a la funcion devuelta.
   */
  suscribir<T>(destino: string, callback: (payload: T) => void): () => void {
    let subscripcion: StompSubscription | null = null;
    const suscribirAhora = () => {
      subscripcion = this.client!.subscribe(destino, (mensaje: IMessage) => {
        try {
          callback(JSON.parse(mensaje.body) as T);
        } catch {
          // payload no era JSON: se ignora
        }
      });
    };

    this.suscripcionesActivas.add(suscribirAhora);
    if (this.client?.connected) {
      suscribirAhora();
    }

    return () => {
      this.suscripcionesActivas.delete(suscribirAhora);
      try {
        if (this.client?.connected) subscripcion?.unsubscribe();
      } catch {
        // la conexion se cerro en el medio: no queda nada que desuscribir
      }
      subscripcion = null;
    };
  }

  publicar(destino: string, body: unknown): void {
    if (!this.client?.connected) {
      return;
    }
    this.client.publish({ destination: destino, body: JSON.stringify(body) });
  }

  alConectar(callback: () => void): () => void {
    if (this.client?.connected) {
      callback();
      return () => {};
    }
    this.callbacksAlConectar.add(callback);
    return () => {
      this.callbacksAlConectar.delete(callback);
    };
  }
}

export const stompService = new StompService();
