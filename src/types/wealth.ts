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
  date: string      // YYYY-MM-DD, used as document ID
  totalEUR: number
}
