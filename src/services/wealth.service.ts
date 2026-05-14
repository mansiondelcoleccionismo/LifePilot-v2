import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  setDoc,
  getDocs,
  getDoc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type {
  Asset,
  WealthSnapshot,
  WealthAsset,
  PatrimonioSnapshot,
  PatrimonioBreakdown,
  WealthAnalysis,
  TipoProducto,
  TipoActivo,
} from '@/types/wealth'

// ── Collection names ────────────────────────────────────────────────────────
const ASSETS_COL        = 'assets'           // legacy
const SNAPSHOTS_COL     = 'wealth_snapshots' // legacy
const WEALTH_ASSETS_COL = 'wealth_assets'
const PATRIMONIO_COL    = 'patrimonio_snapshots'
const ANALYSIS_COL      = 'wealth_analysis'

const USD_TO_EUR = 0.92

// ── Google Sheets sync (fixed sheet) ────────────────────────────────────────
const SHEETS_ID      = '19DCE3rGofq54kFhtbE9NsDzB8K4LxsbPVLzehGNom-o'
const SHEETS_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEETS_ID}/gviz/tq?tqx=out:csv`
const SYNC_LS_KEY    = 'patrimonio_last_sheets_sync'

function parseCSVRows(csv: string): string[][] {
  return csv.split('\n').filter(l => l.trim()).map(line => {
    const row: string[] = []
    let cell = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { if (inQ && line[i + 1] === '"') { cell += '"'; i++ } else inQ = !inQ }
      else if (ch === ',' && !inQ) { row.push(cell.trim()); cell = '' }
      else cell += ch
    }
    row.push(cell.trim())
    return row
  })
}

function parseEuro(raw: string): number {
  const s = raw.replace(/[€$£\s"]/g, '').trim()
  if (!s) return NaN
  // Spanish format: 1.234,56 → dot=thousands, comma=decimal
  if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.'))
  return parseFloat(s.replace(/,/g, ''))
}

export async function syncFromSheets(): Promise<WealthAsset[]> {
  // Fetch CSV with CORS-proxy fallback
  let csv: string
  try {
    const res = await fetch(SHEETS_CSV_URL)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    csv = await res.text()
  } catch {
    const proxied = `https://corsproxy.io/?${encodeURIComponent(SHEETS_CSV_URL)}`
    const res = await fetch(proxied)
    if (!res.ok) throw new Error(`Error ${res.status} al conectar con Google Sheets`)
    csv = await res.text()
  }

  const rows = parseCSVRows(csv)
  if (rows.length < 2) throw new Error('La hoja está vacía o no contiene datos')

  const headers = rows[0].map(h => h.toLowerCase().replace(/['"]/g, '').trim())
  const findCol = (...names: string[]) => headers.findIndex(h => names.some(n => h.includes(n)))

  const nombreCol       = findCol('nombre', 'activo', 'name', 'asset')
  const valorCol        = findCol('valor', 'value', 'importe', 'saldo')
  const plataformaCol   = findCol('plataforma', 'platform', 'broker')
  const tipoProductoCol = findCol('tipo producto', 'tipoproducto', 'producto', 'product')
  const tipoActivoCol   = findCol('tipo activo', 'tipoactivo', 'tipo')

  if (nombreCol < 0 || valorCol < 0) {
    throw new Error(`Columnas "Nombre" y "Valor" no encontradas. Cabeceras: ${rows[0].join(', ')}`)
  }

  const VALID_TIPO_PRODUCTO: TipoProducto[] = [
    'Liquidez', 'Renta Fija', 'Renta Variable', 'Mixto', 'Mixto (RV+RF)',
    'Cripto', 'ETF Sectorial', 'ETF Global', 'REIT', 'Accion',
  ]
  const VALID_TIPO_ACTIVO: TipoActivo[] = ['Liquidez', 'Renta Fija', 'Renta Variable', 'Cripto']

  // Delete all existing assets
  const existing = await getDocs(collection(db, WEALTH_ASSETS_COL))
  await Promise.all(existing.docs.map(d => deleteDoc(doc(db, WEALTH_ASSETS_COL, d.id))))

  // Insert new assets from CSV rows
  const newAssets: WealthAsset[] = []
  const insertTasks = rows.slice(1).map(async row => {
    const nombre = row[nombreCol]?.replace(/^"|"$/g, '').trim()
    const valor  = parseEuro(row[valorCol] ?? '')
    if (!nombre || isNaN(valor) || valor < 0) return

    const plataforma = plataformaCol >= 0 ? (row[plataformaCol]?.replace(/^"|"$/g, '').trim() ?? '') : ''
    const rawTP = tipoProductoCol >= 0 ? row[tipoProductoCol]?.replace(/^"|"$/g, '').trim() : ''
    const rawTA = tipoActivoCol   >= 0 ? row[tipoActivoCol]?.replace(/^"|"$/g, '').trim()   : ''

    const tipoActivo: TipoActivo = VALID_TIPO_ACTIVO.includes(rawTA as TipoActivo)
      ? (rawTA as TipoActivo)
      : rawTA?.includes('Fija') ? 'Renta Fija'
      : rawTA?.includes('Variable') ? 'Renta Variable'
      : rawTA?.toLowerCase().includes('cripto') ? 'Cripto'
      : 'Renta Variable'

    const tipoProducto: TipoProducto = VALID_TIPO_PRODUCTO.includes(rawTP as TipoProducto)
      ? (rawTP as TipoProducto)
      : tipoActivo === 'Liquidez' ? 'Liquidez'
      : tipoActivo === 'Renta Fija' ? 'Renta Fija'
      : tipoActivo === 'Cripto' ? 'Cripto'
      : 'Renta Variable'

    const ref = await addDoc(collection(db, WEALTH_ASSETS_COL), {
      nombre, plataforma, tipoProducto, tipoActivo, valor, updatedAt: serverTimestamp(),
    })
    newAssets.push({ id: ref.id, nombre, plataforma, tipoProducto, tipoActivo, valor, updatedAt: new Date() })
  })
  await Promise.all(insertTasks)

  // Save snapshot and sync timestamp
  if (newAssets.length > 0) await savePatrimonioSnapshot(newAssets)
  localStorage.setItem(SYNC_LS_KEY, new Date().toISOString())

  return newAssets
}

export function getLastSyncDate(): Date | null {
  const raw = localStorage.getItem(SYNC_LS_KEY)
  if (!raw) return null
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

// ── Legacy functions (kept for backward compatibility) ───────────────────────
export function calculateTotal(assets: Asset[]): number {
  return assets.reduce((sum, a) => sum + (a.currency === 'EUR' ? a.value : a.value * USD_TO_EUR), 0)
}

export function subscribeAssets(callback: (assets: Asset[]) => void) {
  const q = query(collection(db, ASSETS_COL), orderBy('lastUpdated', 'desc'))
  return onSnapshot(q, snap => {
    const assets = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      lastUpdated: d.data().lastUpdated?.toDate() ?? new Date(),
    })) as Asset[]
    callback(assets)
  })
}

export async function addAsset(asset: Omit<Asset, 'id' | 'lastUpdated'>) {
  await addDoc(collection(db, ASSETS_COL), { ...asset, lastUpdated: serverTimestamp() })
}

export async function updateAsset(id: string, updates: Partial<Omit<Asset, 'id'>>) {
  await updateDoc(doc(db, ASSETS_COL, id), { ...updates, lastUpdated: serverTimestamp() })
}

export async function deleteAsset(id: string) {
  await deleteDoc(doc(db, ASSETS_COL, id))
}

export async function saveSnapshot(totalEUR: number): Promise<void> {
  const date = new Date().toISOString().split('T')[0]
  await setDoc(doc(db, SNAPSHOTS_COL, date), { date, totalEUR })
}

export function subscribeSnapshots(callback: (snapshots: WealthSnapshot[]) => void) {
  const q = query(collection(db, SNAPSHOTS_COL), orderBy('date', 'desc'))
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })) as WealthSnapshot[])
  })
}

// ── Default assets seed ──────────────────────────────────────────────────────
const DEFAULT_ASSETS: Array<Omit<WealthAsset, 'id' | 'updatedAt'>> = [
  { nombre: 'Cuenta Corriente',                    plataforma: 'BBVA',     tipoProducto: 'Liquidez',      tipoActivo: 'Liquidez',         valor: 7700 },
  { nombre: 'PIAS EURIBOR',                        plataforma: 'IBERCAJA', tipoProducto: 'Renta Fija',    tipoActivo: 'Renta Fija',       valor: 2846.50 },
  { nombre: 'Acciones BBVA',                       plataforma: 'BBVA',     tipoProducto: 'Renta Variable',tipoActivo: 'Renta Variable',   valor: 3786 },
  { nombre: '45,6% Vanguard Global Stk - Ins Plus',plataforma: 'INDEXA',   tipoProducto: 'Mixto (RV+RF)', tipoActivo: 'Renta Variable',   valor: 4492.65 },
  { nombre: '53,7% Vanguard Global Bnd Idx Eur',   plataforma: 'INDEXA',   tipoProducto: 'Mixto (RV+RF)', tipoActivo: 'Renta Fija',       valor: 1938.46 },
  { nombre: 'Bitcoin',                             plataforma: 'COINBASE', tipoProducto: 'Cripto',        tipoActivo: 'Cripto',           valor: 407.89 },
  { nombre: 'NASDAQ-100',                          plataforma: 'XTB',      tipoProducto: 'ETF Sectorial', tipoActivo: 'Renta Variable',   valor: 888.28 },
  { nombre: 'MSCI ACWI',                           plataforma: 'XTB',      tipoProducto: 'ETF Global',    tipoActivo: 'Renta Variable',   valor: 1361.59 },
  { nombre: 'Realty Income',                       plataforma: 'XTB',      tipoProducto: 'REIT',          tipoActivo: 'Renta Variable',   valor: 48.73 },
  { nombre: 'CocaCola',                            plataforma: 'XTB',      tipoProducto: 'Accion',        tipoActivo: 'Renta Variable',   valor: 51.53 },
]

export async function seedDefaultAssetsIfEmpty(): Promise<void> {
  const snap = await getDocs(collection(db, WEALTH_ASSETS_COL))
  if (!snap.empty) return
  await Promise.all(
    DEFAULT_ASSETS.map(a => addDoc(collection(db, WEALTH_ASSETS_COL), { ...a, updatedAt: serverTimestamp() }))
  )
}

// ── Wealth assets CRUD ───────────────────────────────────────────────────────
export function subscribeWealthAssets(callback: (assets: WealthAsset[]) => void): () => void {
  const q = query(collection(db, WEALTH_ASSETS_COL), orderBy('updatedAt', 'desc'))
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      updatedAt: d.data().updatedAt?.toDate() ?? new Date(),
    })) as WealthAsset[])
  })
}

export async function addWealthAsset(asset: Omit<WealthAsset, 'id' | 'updatedAt'>): Promise<string> {
  const ref = await addDoc(collection(db, WEALTH_ASSETS_COL), { ...asset, updatedAt: serverTimestamp() })
  return ref.id
}

export async function updateWealthAsset(id: string, updates: Partial<Omit<WealthAsset, 'id'>>): Promise<void> {
  await updateDoc(doc(db, WEALTH_ASSETS_COL, id), { ...updates, updatedAt: serverTimestamp() })
}

export async function deleteWealthAsset(id: string): Promise<void> {
  await deleteDoc(doc(db, WEALTH_ASSETS_COL, id))
}

// ── Snapshot helpers ─────────────────────────────────────────────────────────
export function calcTotal(assets: WealthAsset[]): number {
  return assets.reduce((s, a) => s + a.valor, 0)
}

export function calcBreakdown(assets: WealthAsset[]): PatrimonioBreakdown {
  return assets.reduce(
    (acc, a) => {
      if (a.tipoActivo === 'Liquidez')        acc.liquidez       += a.valor
      if (a.tipoActivo === 'Renta Fija')      acc.rentaFija      += a.valor
      if (a.tipoActivo === 'Renta Variable')  acc.rentaVariable  += a.valor
      if (a.tipoActivo === 'Cripto')          acc.cripto         += a.valor
      return acc
    },
    { liquidez: 0, rentaFija: 0, rentaVariable: 0, cripto: 0 },
  )
}

export async function savePatrimonioSnapshot(assets: WealthAsset[]): Promise<void> {
  const date = new Date().toISOString().split('T')[0]
  const totalEUR = calcTotal(assets)
  const breakdown = calcBreakdown(assets)
  const assetData = assets.map(({ id: _id, updatedAt: _u, ...rest }) => rest)
  await setDoc(doc(db, PATRIMONIO_COL, date), {
    date,
    assets: assetData,
    totalEUR,
    breakdown,
    createdAt: serverTimestamp(),
  })
}

export function subscribePatrimonioSnapshots(callback: (snaps: PatrimonioSnapshot[]) => void): () => void {
  const q = query(collection(db, PATRIMONIO_COL), orderBy('date', 'desc'))
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate() ?? new Date(),
    })) as PatrimonioSnapshot[])
  })
}

// ── AI Analysis cache ─────────────────────────────────────────────────────────
export async function getWealthAnalysis(): Promise<WealthAnalysis | null> {
  const snap = await getDoc(doc(db, ANALYSIS_COL, 'latest'))
  if (!snap.exists()) return null
  const data = snap.data()
  return {
    id: 'latest',
    ...data,
    generatedAt: data.generatedAt?.toDate() ?? new Date(),
  } as WealthAnalysis
}

export async function saveWealthAnalysis(
  analysis: Omit<WealthAnalysis, 'id' | 'generatedAt'>,
): Promise<void> {
  await setDoc(doc(db, ANALYSIS_COL, 'latest'), {
    ...analysis,
    generatedAt: serverTimestamp(),
  })
}

// ── Formatting helpers ───────────────────────────────────────────────────────
export function fmtEur(n: number, decimals = 0): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(n)
}

export const TIPO_PRODUCTO_OPTIONS: TipoProducto[] = [
  'Liquidez', 'Renta Fija', 'Renta Variable', 'Mixto', 'Mixto (RV+RF)',
  'Cripto', 'ETF Sectorial', 'ETF Global', 'REIT', 'Accion',
]

export const TIPO_ACTIVO_OPTIONS: TipoActivo[] = [
  'Liquidez', 'Renta Fija', 'Renta Variable', 'Cripto',
]
