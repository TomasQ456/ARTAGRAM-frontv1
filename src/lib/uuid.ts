/**
 * Generador de UUID v4 seguro compatible con contextos seguros (HTTPS) y no seguros (HTTP por IP).
 * En HTTP no seguro, crypto.randomUUID() es undefined en la mayoria de navegadores,
 * provocando TypeError si no se provee un reemplazo RFC-4122.
 */
export function generarUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
