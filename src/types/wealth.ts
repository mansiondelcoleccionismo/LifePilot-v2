// ── Legacy types (kept for backward compatibility) ─────────────────────────
export type AssetType = 'cuenta' | 'inversion' | 'cripto' | 'inmueble' | 'otro'
export type Currency = 'EUR' | 'USD'

export interface Asset {
  id: string
  name: string
  type: AssetType
  value: number
  currency: Currency
  lastUpdated: Date
}

export interface WealthSnapshot {
  id: string
  date: string
  totalEUR: number
}

// ── New types ───────────────────────────────────────────────────────────────
export type TipoProducto =
  | 'Liquidez'
  | 'Renta Fija'
  | 'Renta Variable'
  | 'Mixto'
  | 'Mixto (RV+RF)'
  | 'Cripto'
  | 'ETF Sectorial'
  | 'ETF Global'
  | 'REIT'
  | 'Accion'

export type TipoActivo = 'Liquidez' | 'Renta Fija' | 'Renta Variable' | 'Cripto'

export interface WealthAsset {
  id: string
  nombre: string
  plataforma: string
  tipoProducto: TipoProducto
  tipoActivo: TipoActivo
  valor: number
  updatedAt: Date
}

export interface PatrimonioBreakdown {
  liquidez: number
  rentaFija: number
  rentaVariable: number
  cripto: number
}

export interface PatrimonioSnapshot {
  id: string
  date: string
  assets: Omit<WealthAsset, 'id' | 'updatedAt'>[]
  totalEUR: number
  breakdown: PatrimonioBreakdown
  createdAt: Date
}

export interface RiesgoItem {
  tipo: string
  nivel: 'bajo' | 'medio' | 'alto'
  descripcion: string
  solucion: string
}

export interface RecomendacionItem {
  accion: string
  prioridad: 'inmediata' | 'corto_plazo' | 'largo_plazo'
  razon: string
  impacto: string
}

export interface WealthAnalysis {
  id: string
  puntuacion: number
  resumen: string
  puntos_fuertes: string[]
  areas_mejora: string[]
  riesgos: RiesgoItem[]
  recomendaciones: RecomendacionItem[]
  proyeccion: { a_5_anos: string; a_10_anos: string; supuesto: string }
  generatedAt: Date
  totalEUR: number
}
