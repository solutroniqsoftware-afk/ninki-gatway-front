export type PieceStatut = "operational" | "degraded" | "offline";

export interface Piece {
  id: string;
  numero: number;
  nom: string;
  devEUI?: string;
  batterie?: string;
  statut: PieceStatut;
  temperature: number;
  nombreTirs: number;
  stockObus: number;
  stockMax: number;
  cadenceTir: number;
  positionMGRS: string;
  lat: number;
  lng: number;
  azimutConsigne: number;
  azimutReel: number;
  giteConsigne: number;
  giteReel: number;
  dernierTir: number;
  enTirEnCours: boolean;
  derniereActivite: number;
  elevationReel?: number;
  distanceHorizontale?: number;
  distanceSurface?: number;
  azimutMil?: number | null;
  giteMil?: number | null;
  elevationMil?: number | null;
  azimutMag?: number | null;
}

export interface Alerte {
  id: string;
  pieceId: string;
  type: "temperature" | "desalignement" | "stock_bas" | "hors_ligne" | "tir" | "cadence";
  criticite: "info" | "warning" | "critical";
  message: string;
  valeur?: string;
  timestamp: number;
  acquittee: boolean;
}

export interface WeatherData {
  temperature: number;
  humidity: number;
  pressure: number;
  windSpeed: number;
  windDirection: number;
}

export interface User {
  id: string;
  identifiant: string;
  nom: string;
  prenom: string;
  grade: string;
  role: "ADMIN" | "SUPER_ADMIN" | "RESPONSABLE";
  mustChangePassword: boolean;
  pieces: Array<{ id: string; nom: string; numero: number }>;
}

export interface CommandeEnvoyee {
  id: string;
  pieceId: string;
  commande: string;
  timestamp: number;
  lue?: boolean;
  urgent?: boolean;
}

// ─── Backend raw types (used for API response mapping) ────────────────────────

export interface BackendPiece {
  id: string;
  nom: string;
  numero: number;
  devEUI: string;
  statut: "OPERATIONAL" | "DEGRADED" | "OFFLINE";
  responsableId: string | null;
  responsable: { id: string; nom: string; prenom: string } | null;
  stockObus?: number;
  cadenceStandard?: number;
}

export interface BackendTelemetry {
  id: number;
  pieceId: string;
  temperature: number;
  nbTirs: number;
  stockObus: number;
  cadence: number;
  azimutReel: number | null;
  azimutConsigne: number | null;
  giteReel: number | null;
  giteConsigne: number | null;
  lat: number | null;
  lon: number | null;
  mgrs: string | null;
  time: string;
  statut?: string;
  elevationReel?: number | null;
  distanceHorizontale?: number | null;
  distanceSurface?: number | null;
  azimutMil?: number | null;
  giteMil?: number | null;
  elevationMil?: number | null;
  azimutMag?: number | null;
}

export interface BackendAlerte {
  id: string;
  pieceId: string;
  type: string;
  niveau: "WARNING" | "CRITICAL";
  message: string;
  valeur: number | null;
  acquittee: boolean;
  createdAt: string;
}
