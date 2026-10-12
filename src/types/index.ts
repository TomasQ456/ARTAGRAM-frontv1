export type TipoPincel = 'LAPIZ' | 'MARCADOR' | 'ACUARELA';

export interface Punto {
  x: number;
  y: number;
}

export interface PerfilResponse {
  usuarioId: string;
  nombreArtista: string;
  biografia: string;
  fotoUrl: string | null;
  enlaces: { etiqueta: string; url: string }[];
  obrasDestacadas: { titulo: string; imagenUrl: string }[];
  esPropio: boolean;
}

export interface ComunidadResponse {
  id: string;
  nombre: string;
  descripcion: string;
  publica: boolean;
  creador: string;
  totalMiembros: number;
  miRol: string | null;
}

export interface TrazoEvento {
  tipo: 'PARCIAL' | 'FINAL' | 'EDITADO';
  trazoEnProgresoId: string | null;
  secuencia: number | null;
  autorId: string;
  autorNombre: string;
  tipoPincel: TipoPincel;
  colorHex: string;
  grosor: number;
  opacidad: number;
  capa: number;
  puntos: Punto[];
}

export interface TrazoDto {
  id: string;
  secuencia: number;
  autorId: string;
  autorNombre: string;
  tipoPincel: TipoPincel;
  colorHex: string;
  grosor: number;
  opacidad: number;
  capa: number;
  puntos: Punto[];
  creadoEn: string;
}

export interface BloqueoEvento {
  tipo: 'TOMADO' | 'LIBERADO';
  trazoId: string;
  propietarioNombre: string | null;
}

export interface RegionEstado {
  regionIndex: number;
  snapshotPngBase64: string | null;
  trazosDesdeSnapshot: BannerTrazoEvento[];
}

export interface BannerTrazoEvento {
  regionIndex: number;
  secuencia: number;
  autorId: string;
  autorNombre: string;
  tipoPincel: TipoPincel;
  colorHex: string;
  grosor: number;
  opacidad: number;
  puntos: Punto[];
}

export interface SalaFiestaResponse {
  id: string;
  codigo: string;
  anfitrionNombre: string;
  duracionRondaSegundos: number;
  cupoMaximo: number;
  estado: 'ESPERANDO' | 'EN_RONDA' | 'CERRADA';
  totalParticipantes: number;
  numeroRonda: number;
}

export interface PartyTrazoDto {
  secuencia: number;
  autorId: string;
  autorNombre: string;
  borrador: boolean;
  tipoPincel: TipoPincel | null;
  colorHex: string | null;
  grosor: number;
  opacidad: number;
  puntos: Punto[];
}

export interface EstadoRondaResponse {
  estadoSala: string;
  numeroRonda: number;
  msRestantes: number;
  pincel: TipoPincel | null;
  colorHex: string | null;
  grosor: number | null;
  opacidad: number | null;
  borradorPropietario: string | null;
  trazos: PartyTrazoDto[];
}

export interface PartyEvento {
  tipo: 'TICK' | 'RONDA_TERMINADA' | 'BORRADOR_DISPONIBLE' | 'BORRADOR_TOMADO' | 'BORRADOR_LIBERADO' | 'TRAZO';
  msRestantes: number | null;
  trazo: PartyTrazoDto | null;
  propietarioBorrador: string | null;
}

export interface MensajePersonalDto {
  id: string;
  remitenteId: string;
  remitenteNombre: string;
  destinatarioId: string;
  contenido: string;
  entregado: boolean;
  creadoEn: string;
}

export interface MensajeComunidadDto {
  id: string;
  remitenteId: string;
  remitenteNombre: string;
  contenido: string;
  creadoEn: string;
}

export interface PublicacionDto {
  id: string;
  autorId: string;
  autorNombre: string;
  titulo: string;
  descripcion: string;
  obraFinalUrl: string;
  imagenesProcesoUrls: string[];
  etiquetas: string[];
  contadorLikes: number;
  meGusta: boolean;
  creadoEn: string;
}

export interface LikeResponse {
  meGusta: boolean;
  contadorLikes: number;
}

export interface FeedResponse {
  publicaciones: PublicacionDto[];
  cursorFechaSiguiente: string | null;
  cursorIdSiguiente: string | null;
  hayMas: boolean;
  artistasSugeridos: string[];
}

export interface KpiDetalle {
  id: string;
  nombre: string;
  valorActual: number;
  meta: number;
  tendencia: 'SUBE' | 'BAJA' | 'IGUAL';
  formula: string;
  periodoDesde: string;
  periodoHasta: string;
  cantidadEventosContados: number;
}
